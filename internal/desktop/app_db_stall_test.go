package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"autoreas-bridge/internal/observability/dbstall"
	"autoreas-bridge/internal/observability/eventlog"
)

// stallTestEvidence keeps evidence for db in a temporary directory, with a short
// probe budget and a fixed clock and id.
func stallTestEvidence(t *testing.T, db *sql.DB) *stallEvidence {
	t.Helper()
	evidence := newStallEvidence(db, filepath.Join(t.TempDir(), stallLogDir), nil)
	evidence.probeBudget = 50 * time.Millisecond
	evidence.now = func() time.Time { return time.UnixMilli(1_794_544_000_000) }
	evidence.newID = func() string { return "stall-1" }
	return evidence
}

// holdConnection takes the pool's only connection until the test ends, the way
// the held connection behind the 2026-11 silences did.
func holdConnection(t *testing.T, db *sql.DB) {
	t.Helper()
	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatalf("hold connection: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
}

// evidenceFiles lists the evidence directory, empty when it does not exist.
func evidenceFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatalf("read evidence dir: %v", err)
	}
	names := []string{}
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func TestAbandonedRequestWithAHeldConnectionWritesEvidenceOnce(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)
	app, mem := newAppWithMemLogger(&App{})
	evidence.logger = app.sharedLogger
	holdConnection(t, db)

	evidence.onRequestAbandoned("/api/status")
	evidence.onRequestAbandoned("/api/sync/reconcile")

	if files := evidenceFiles(t, evidence.dir); len(files) != 1 || files[0] != dbstall.PendingFile {
		t.Fatalf("expected one pending evidence file, got %#v", files)
	}
	if entries := mem.Recent(); len(entries) != 0 {
		t.Fatalf("expected a written stall to log nothing, got %#v", entries)
	}
	pending, ok, err := dbstall.ReadPending(evidence.dir)
	if !ok || err != nil {
		t.Fatalf("read pending: ok=%v err=%v", ok, err)
	}
	header := pending.Header
	if header.ID != "stall-1" || header.Route != "/api/status" || header.OccurredAtMS != 1_794_544_000_000 ||
		header.Pool.InUse != 1 || header.Pool.MaxOpen != 1 {
		t.Fatalf("expected the first abandoned request's header with the held pool, got %#v", header)
	}
	if !strings.Contains(string(pending.Dump), "goroutine ") {
		t.Fatalf("expected a goroutine dump after the header, got %q", pending.Dump)
	}
}

func TestAbandonedRequestWithAFreeConnectionWritesNothing(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)

	evidence.onRequestAbandoned("/api/status")

	if files := evidenceFiles(t, evidence.dir); len(files) != 0 {
		t.Fatalf("expected no evidence when the client simply left, got %#v", files)
	}
	// A free pool does not use up the one evidence the process may write.
	holdConnection(t, db)
	evidence.onRequestAbandoned("/api/status")
	if files := evidenceFiles(t, evidence.dir); len(files) != 1 {
		t.Fatalf("expected a later stall to still be recorded, got %#v", files)
	}
}

func TestAbandonedRequestAfterTheDatabaseClosedWritesNothing(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	evidence.onRequestAbandoned("/api/status")

	if files := evidenceFiles(t, evidence.dir); len(files) != 0 {
		t.Fatalf("expected a shutdown not to read as a stall, got %#v", files)
	}
}

// writePendingStall leaves a stall recorded by a previous process.
func writePendingStall(t *testing.T, dir, id string) {
	t.Helper()
	header := dbstall.Header{ID: id, OccurredAtMS: 1_794_544_000_000, Route: "/api/status", Pool: dbstall.PoolStats{MaxOpen: 1, InUse: 1}}
	dump := "goroutine 12 [chan receive, 46 minutes]:\nautoreas-bridge/internal/persistence.InWriteTx(0x1)\n\tD:/write_tx.go:30 +0x1\n"
	if err := dbstall.Write(dir, header, []byte(dump)); err != nil {
		t.Fatalf("write pending stall: %v", err)
	}
}

// stallRows reads the stored stall events.
func stallRows(t *testing.T, db *sql.DB) []eventlog.EventRecord {
	t.Helper()
	rows, err := db.Query(`SELECT occurred_at_ms, domain, level, correlation_id, metadata_json FROM runtime_events WHERE event_type = ?`, stallEventType)
	if err != nil {
		t.Fatalf("query stall rows: %v", err)
	}
	defer func() { _ = rows.Close() }()
	records := []eventlog.EventRecord{}
	for rows.Next() {
		var record eventlog.EventRecord
		var metadata string
		if err := rows.Scan(&record.OccurredAtMS, &record.Domain, &record.Level, &record.CorrelationID, &metadata); err != nil {
			t.Fatalf("scan stall row: %v", err)
		}
		if err := json.Unmarshal([]byte(metadata), &record.Metadata); err != nil {
			t.Fatalf("decode stall metadata: %v", err)
		}
		records = append(records, record)
	}
	return records
}

// incidentCount counts the stored incidents.
func incidentCount(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM incidents`).Scan(&count); err != nil {
		t.Fatalf("count incidents: %v", err)
	}
	return count
}

func TestImportStallEvidenceStoresOneEventAndRotatesTheFile(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	app := &App{bridgeDB: db, dbStall: stallTestEvidence(t, db)}
	writePendingStall(t, app.dbStall.dir, "stall-7")

	app.importStallEvidence()
	app.importStallEvidence()

	rows := stallRows(t, db)
	if len(rows) != 1 {
		t.Fatalf("expected exactly one stall event, got %#v", rows)
	}
	row := rows[0]
	if row.Domain != "api" || row.Level != "error" || row.CorrelationID != "stall-7" || row.OccurredAtMS != 1_794_544_000_000 {
		t.Fatalf("expected the stall as an api error at its own time, got %#v", row)
	}
	suspects, _ := row.Metadata["suspects"].([]any)
	if row.Metadata["route"] != "/api/status" || len(suspects) != 1 {
		t.Fatalf("expected the route and the one suspect in metadata, got %#v", row.Metadata)
	}
	if incidentCount(t, db) != 1 {
		t.Fatalf("expected the stall to open one incident, got %d", incidentCount(t, db))
	}
	if files := evidenceFiles(t, app.dbStall.dir); len(files) != 1 || files[0] != "db-stall-1.log" {
		t.Fatalf("expected the imported file rotated to db-stall-1.log, got %#v", files)
	}
}

func TestImportStallEvidenceDoesNotRepeatAnEventStoredBeforeARotationFailed(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	app := &App{bridgeDB: db, dbStall: stallTestEvidence(t, db)}
	writePendingStall(t, app.dbStall.dir, "stall-7")
	pending, _, _ := dbstall.ReadPending(app.dbStall.dir)
	if err := eventlog.NewStore(db).InsertEvent(context.Background(), stallRecord(pending)); err != nil {
		t.Fatalf("store the earlier import: %v", err)
	}

	app.importStallEvidence()

	if rows := stallRows(t, db); len(rows) != 1 {
		t.Fatalf("expected the earlier row alone, got %#v", rows)
	}
	if incidentCount(t, db) != 0 {
		t.Fatalf("expected no second incident for an already imported stall, got %d", incidentCount(t, db))
	}
	if files := evidenceFiles(t, app.dbStall.dir); len(files) != 1 || files[0] != "db-stall-1.log" {
		t.Fatalf("expected the file rotated, got %#v", files)
	}
}

func TestImportStallEvidenceKeepsTheFileWhenTheEventCannotBeStored(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	app, mem := newAppWithMemLogger(&App{bridgeDB: db, dbStall: stallTestEvidence(t, db)})
	writePendingStall(t, app.dbStall.dir, "stall-7")
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	app.importStallEvidence()

	if files := evidenceFiles(t, app.dbStall.dir); len(files) != 1 || files[0] != dbstall.PendingFile {
		t.Fatalf("expected the pending file kept for the next start, got %#v", files)
	}
	if entries := warnEntries(mem); len(entries) != 1 || entries[0].EventType != stallImportFailedEventType {
		t.Fatalf("expected one import failure warning, got %#v", entries)
	}
}

func TestImportStallEvidenceRotatesAnUnreadableFile(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	app, mem := newAppWithMemLogger(&App{bridgeDB: db, dbStall: stallTestEvidence(t, db)})
	if err := os.MkdirAll(app.dbStall.dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(app.dbStall.dir, dbstall.PendingFile), []byte("garbage"), 0o600); err != nil {
		t.Fatalf("seed: %v", err)
	}

	app.importStallEvidence()

	if rows := stallRows(t, db); len(rows) != 0 {
		t.Fatalf("expected no event from an unreadable file, got %#v", rows)
	}
	if files := evidenceFiles(t, app.dbStall.dir); len(files) != 1 || files[0] != "db-stall-1.log" {
		t.Fatalf("expected the unreadable file rotated so no start reads it again, got %#v", files)
	}
	if entries := warnEntries(mem); len(entries) != 1 || entries[0].EventType != stallImportFailedEventType {
		t.Fatalf("expected one import failure warning, got %#v", entries)
	}
}

// countProbes wraps the evidence's probe so a test can count pool probes.
func countProbes(evidence *stallEvidence) *atomic.Int32 {
	count := &atomic.Int32{}
	probe := evidence.probe
	evidence.probe = func(ctx context.Context) error {
		count.Add(1)
		return probe(ctx)
	}
	return count
}

// TestAbandonedRequestsAfterTheEvidenceIsWrittenDoNotProbe pins the cost
// promise: once a process recorded its stall, an abandoned request costs nothing.
func TestAbandonedRequestsAfterTheEvidenceIsWrittenDoNotProbe(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)
	probes := countProbes(evidence)
	holdConnection(t, db)

	evidence.onRequestAbandoned("/api/status")
	evidence.onRequestAbandoned("/api/status")

	if probes.Load() != 1 {
		t.Fatalf("expected one probe, got %d", probes.Load())
	}
}

// TestOnlyOneProbeRunsAtATime pins that requests abandoned together share one
// probe instead of each waiting on the pool.
func TestOnlyOneProbeRunsAtATime(t *testing.T) {
	t.Parallel()
	evidence := stallTestEvidence(t, captureAppTestDB(t))
	entered, release := make(chan struct{}), make(chan struct{})
	probes := &atomic.Int32{}
	evidence.probe = func(context.Context) error {
		probes.Add(1)
		close(entered)
		<-release
		return nil
	}
	done := make(chan struct{})
	go func() {
		evidence.onRequestAbandoned("/api/status")
		close(done)
	}()
	<-entered

	evidence.onRequestAbandoned("/api/sync/reconcile")
	close(release)
	<-done

	if probes.Load() != 1 {
		t.Fatalf("expected the second request to skip the running probe, got %d probes", probes.Load())
	}
}

// TestStallEvidenceDumpNamesTheBlockedBridgeGoroutines proves the written dump
// is the per-goroutine form the importer reads: a Bridge goroutine blocked
// while the connection is held comes back as a suspect.
func TestStallEvidenceDumpNamesTheBlockedBridgeGoroutines(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)
	holdConnection(t, db)
	blocked := make(chan struct{})
	t.Cleanup(func() { close(blocked) })
	go func() { <-blocked }()

	evidence.onRequestAbandoned("/api/status")

	pending, _, err := dbstall.ReadPending(evidence.dir)
	if err != nil {
		t.Fatalf("read pending: %v", err)
	}
	for _, suspect := range dbstall.Suspects(pending.Dump) {
		if strings.Contains(strings.Join(suspect.Frames, " "), "TestStallEvidenceDumpNamesTheBlockedBridgeGoroutines") {
			return
		}
	}
	t.Fatalf("expected the blocked test goroutine among the suspects of %q", pending.Dump)
}

func TestStallEvidenceThatCannotBeWrittenIsLogged(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)
	// A file where the directory should be makes the write fail.
	if err := os.WriteFile(evidence.dir, []byte("x"), 0o600); err != nil {
		t.Fatalf("seed: %v", err)
	}
	app, mem := newAppWithMemLogger(&App{})
	evidence.logger = app.sharedLogger
	holdConnection(t, db)

	evidence.onRequestAbandoned("/api/status")

	entries := mem.Recent()
	if len(entries) != 1 || entries[0].EventType != "api.db_stall_write_failed" || entries[0].Level != "error" {
		t.Fatalf("expected one write failure logged, got %#v", entries)
	}
}

func TestStallEvidenceThatCannotBeWrittenWithoutALoggerIsDropped(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	evidence := stallTestEvidence(t, db)
	if err := os.WriteFile(evidence.dir, []byte("x"), 0o600); err != nil {
		t.Fatalf("seed: %v", err)
	}
	holdConnection(t, db)

	evidence.onRequestAbandoned("/api/status")

	if !evidence.recorded.Load() {
		t.Fatal("expected the failed write to still use up the process's one stall")
	}
}

func TestConfigureStallEvidenceKeepsLogsWhereTheResolverSays(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), stallLogDir)
	app := &App{bridgeDB: captureAppTestDB(t), resolveStallLogDir: func() (string, error) { return dir, nil }}

	app.configureStallEvidence()

	if app.dbStall == nil || app.dbStall.dir != dir || app.dbStall.db != app.bridgeDB {
		t.Fatalf("expected evidence for the bridge database in %s, got %#v", dir, app.dbStall)
	}
}

// TestConfigureStallEvidenceSkipsWhatItCannotPlace pins the cases that keep no
// evidence: an existing setup is kept, and no database, no resolver (an
// injected test database) or a failed resolver configures none.
func TestConfigureStallEvidenceSkipsWhatItCannotPlace(t *testing.T) {
	t.Parallel()
	resolver := func() (string, error) { return t.TempDir(), nil }
	existing := &stallEvidence{dir: "kept"}
	kept := &App{bridgeDB: captureAppTestDB(t), dbStall: existing, resolveStallLogDir: resolver}
	kept.configureStallEvidence()
	if kept.dbStall != existing {
		t.Fatalf("expected the existing setup kept, got %#v", kept.dbStall)
	}

	for name, app := range map[string]*App{
		"no database": {resolveStallLogDir: resolver},
		"no resolver": {bridgeDB: captureAppTestDB(t)},
	} {
		app.configureStallEvidence()
		app.onRequestAbandoned("/api/status")
		if app.dbStall != nil {
			t.Fatalf("%s: expected no evidence, got %#v", name, app.dbStall)
		}
	}
}

func TestConfigureStallEvidenceLogsAResolverFailure(t *testing.T) {
	t.Parallel()
	app, mem := newAppWithMemLogger(&App{
		bridgeDB:           captureAppTestDB(t),
		resolveStallLogDir: func() (string, error) { return "", errors.New("no data dir") },
	})

	app.configureStallEvidence()

	if app.dbStall != nil {
		t.Fatalf("expected no evidence without a directory, got %#v", app.dbStall)
	}
	if entries := warnEntries(mem); len(entries) != 1 || entries[0].EventType != stallImportFailedEventType {
		t.Fatalf("expected one warning, got %#v", entries)
	}
}

func TestDefaultsKeepStallEvidenceOnlyBesideTheRealBootstrap(t *testing.T) {
	t.Parallel()
	injected := &App{bootstrapBridgeDB: func() (*sql.DB, error) { return nil, nil }}
	real := &App{}

	injected.ensureAnimeRuntimeDependencies()
	real.ensureAnimeRuntimeDependencies()

	if injected.resolveStallLogDir != nil || real.resolveStallLogDir == nil {
		t.Fatal("expected a stall log resolver only beside the real bootstrap")
	}
}
