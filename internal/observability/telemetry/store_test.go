package telemetry

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side
	// effect and removing it turns every sql.Open("sqlite", ...) here into a
	// runtime error.
	_ "modernc.org/sqlite"
)

const (
	// pruneKindA and pruneKindB are the two kinds the retention tests
	// register: two distinct names are the whole point of the isolation
	// assertion, since a per-kind prune that is really a global prune is
	// only observable when a second kind's rows exist to be evicted.
	pruneKindA KindName = "prune_kind_a"
	pruneKindB KindName = "prune_kind_b"
	// pruneKindLimit is deliberately tiny. The shipped cycle_report cap is
	// not the behaviour under test: the per-kind cap is.
	pruneKindLimit = 3
)

// openTelemetryTestDB creates a temporary, schema-less SQLite database: the
// schema step has its own test and is applied explicitly where a test needs
// it, never inherited here.
func openTelemetryTestDB(t *testing.T) *sql.DB {
	t.Helper()

	path := filepath.Join(t.TempDir(), "telemetry.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// openTelemetryStoreTestDB creates a temporary SQLite database with the
// telemetry schema already applied.
func openTelemetryStoreTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db := openTelemetryTestDB(t)
	for _, table := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
	return db
}

// pruneTestRegistry registers the two small-capped kinds the retention tests
// share. Retention is resolved per kind through the registry, so a store
// without one cannot know any kind's cap.
func pruneTestRegistry() *Registry {
	return NewRegistry(
		stubKind{name: pruneKindA, limit: pruneKindLimit},
		stubKind{name: pruneKindB, limit: pruneKindLimit},
	)
}

// storeEvent builds one already-validated event, the only shape Insert
// accepts: decoding and validation belong to the kind, which has already run
// by the time a caller reaches the store.
func storeEvent(kind KindName, eventID string, reportedAtMS int64) Event {
	return Event{
		DeviceID:     "device-1",
		ReportedAtMS: reportedAtMS,
		Kind:         kind,
		Validated:    Validated{EventID: eventID, Payload: []byte(`{"event":"` + eventID + `"}`)},
	}
}

// countEvents returns the stored row count for one kind.
func countEvents(t *testing.T, db *sql.DB, kind KindName) int {
	t.Helper()

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM device_telemetry_events WHERE kind = ?`, kind).Scan(&count); err != nil {
		t.Fatalf("count %s events: %v", kind, err)
	}
	return count
}

// eventIDs returns one kind's stored event ids, newest first.
func eventIDs(t *testing.T, db *sql.DB, kind KindName) []string {
	t.Helper()

	rows, err := db.Query(`SELECT event_id FROM device_telemetry_events WHERE kind = ? ORDER BY reported_at_ms DESC`, kind)
	if err != nil {
		t.Fatalf("query %s event ids: %v", kind, err)
	}
	defer func() { _ = rows.Close() }()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan event id: %v", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate event ids: %v", err)
	}
	return ids
}

// seedEvents bulk-inserts count rows in one transaction (bypassing Insert)
// with ascending reported_at_ms and distinct event ids, so a retention test
// can start from a table state no sequence of successful writes would
// produce -- older rows of a kind that has not been written yet.
func seedEvents(t *testing.T, db *sql.DB, kind KindName, count int, startAtMS int64) {
	t.Helper()

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(`
		INSERT INTO device_telemetry_events (device_id, reported_at_ms, kind, event_id, payload_json)
		VALUES (?, ?, ?, ?, '{}')
	`)
	if err != nil {
		t.Fatalf("prepare seed stmt: %v", err)
	}
	defer func() { _ = stmt.Close() }()

	for i := range count {
		if _, err := stmt.Exec("device-seed", startAtMS+int64(i), kind, fmt.Sprintf("seed-%d", i)); err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed tx: %v", err)
	}
}

// TestInsertStoresSameEventIDUnderTwoKindsAsTwoRows asserts identity is
// scoped per kind: one kind's key namespace must not collide with another's,
// which is why the uniqueness constraint is (kind, event_id) and not
// event_id alone.
func TestInsertStoresSameEventIDUnderTwoKindsAsTwoRows(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	store := NewStore(db, StoreConfig{Registry: pruneTestRegistry()})

	for _, kind := range []KindName{pruneKindA, pruneKindB} {
		outcome, err := store.Insert(context.Background(), storeEvent(kind, "shared-event", 1000))
		if err != nil {
			t.Fatalf("insert %s: %v", kind, err)
		}
		if outcome != Stored {
			t.Fatalf("expected the first insert of %s to be Stored, got %v", kind, outcome)
		}
		if count := countEvents(t, db, kind); count != 1 {
			t.Fatalf("expected one row for %s, got %d", kind, count)
		}
	}
}

// TestInsertDuplicateKindEventIDStoresOneRowAndReportsDuplicate asserts a
// repeated (kind, event_id) is a no-op that still reports Duplicate rather
// than an error, which is what lets a caller retry blind and remain correct.
func TestInsertDuplicateKindEventIDStoresOneRowAndReportsDuplicate(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	store := NewStore(db, StoreConfig{Registry: pruneTestRegistry()})
	event := storeEvent(pruneKindA, "duplicate-event", 1000)

	first, err := store.Insert(context.Background(), event)
	if err != nil {
		t.Fatalf("first insert: %v", err)
	}
	if first != Stored {
		t.Fatalf("expected the first insert to be Stored, got %v", first)
	}

	second, err := store.Insert(context.Background(), event)
	if err != nil {
		t.Fatalf("second insert: %v", err)
	}
	if second != Duplicate {
		t.Fatalf("expected the repeated (kind, event_id) to be Duplicate, got %v", second)
	}
	if count := countEvents(t, db, pruneKindA); count != 1 {
		t.Fatalf("expected exactly one row for the duplicated event, got %d", count)
	}
}

// TestPruneKeepsNewestWithinOneKindAndNeverEvictsAnotherKind asserts pruning
// is per kind: the written kind keeps only its newest cap-many rows, and a
// second kind's rows survive untouched. A single global cap with
// heterogeneous write frequencies is exactly the failure this prevents -- a
// high-frequency kind would evict a low-frequency one.
func TestPruneKeepsNewestWithinOneKindAndNeverEvictsAnotherKind(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	seedEvents(t, db, pruneKindA, pruneKindLimit+2, 1000)
	seedEvents(t, db, pruneKindB, pruneKindLimit+2, 1000)

	store := NewStore(db, StoreConfig{Registry: pruneTestRegistry()})
	outcome, err := store.Insert(context.Background(), storeEvent(pruneKindA, "fresh-event", 9000))
	if err != nil {
		t.Fatalf("insert fresh event: %v", err)
	}
	if outcome != Stored {
		t.Fatalf("expected the fresh event to be Stored, got %v", outcome)
	}

	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit {
		t.Fatalf("expected kind %s pruned to its own cap %d, got %d rows", pruneKindA, pruneKindLimit, count)
	}
	want := []string{"fresh-event", "seed-4", "seed-3"}
	if got := eventIDs(t, db, pruneKindA); !slices.Equal(got, want) {
		t.Fatalf("expected the newest %d rows of %s to survive, got %v want %v", pruneKindLimit, pruneKindA, got, want)
	}
	if count := countEvents(t, db, pruneKindB); count != pruneKindLimit+2 {
		t.Fatalf("expected pruning %s to leave %s's %d rows untouched, got %d", pruneKindA, pruneKindB, pruneKindLimit+2, count)
	}
}

// TestPruneRunsOnFirstSuccessfulWriteOfTheProcess asserts the first
// successful write of every process prunes unconditionally, so a session
// that persists fewer than a full cadence still bounds its kind's table --
// the common case for a desktop app with short sessions.
func TestPruneRunsOnFirstSuccessfulWriteOfTheProcess(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	seedEvents(t, db, pruneKindA, pruneKindLimit+2, 1000)

	store := NewStore(db, StoreConfig{Registry: pruneTestRegistry()})
	outcome, err := store.Insert(context.Background(), storeEvent(pruneKindA, "first-write", 9000))
	if err != nil {
		t.Fatalf("first insert of a fresh store: %v", err)
	}
	if outcome != Stored {
		t.Fatalf("expected the first write to be Stored, got %v", outcome)
	}
	if count := countEvents(t, db, pruneKindA); count != pruneKindLimit {
		t.Fatalf("expected the first write of the process to prune down to %d, got %d", pruneKindLimit, count)
	}
}

// TestInsertShedsWithoutAHandle asserts a store with no database handle
// sheds with an error instead of reporting a write it never performed. Its
// store declares no kind either, so the handle check must come first for
// this test to keep asking the question it is named for.
func TestInsertShedsWithoutAHandle(t *testing.T) {
	t.Parallel()

	store := NewStore(nil, StoreConfig{})
	outcome, err := store.Insert(context.Background(), storeEvent(pruneKindA, "no-handle-event", 1000))
	if err == nil {
		t.Fatal("expected an error from a store with no database handle")
	}
	if outcome != Shed {
		t.Fatalf("expected Shed from a store with no database handle, got %v", outcome)
	}
}

// TestInsertShedsUnderHeldConnection is MANDATORY, LOAD-BEARING -- do not
// weaken. Neither a status-only nor an elapsed-only assertion proves
// shedding: a response-deadline implementation also returns at the budget,
// it just keeps running afterward, still queued for the connection, and
// lands its row once the holder releases. Steps 3-4 are the only observable
// difference between a correct implementation and a broken one, and a shed
// must never be reported as stored.
func TestInsertShedsUnderHeldConnection(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	db.SetMaxOpenConns(1)

	// (1) Hold the single shared connection with another writer.
	holder, err := db.Begin()
	if err != nil {
		t.Fatalf("begin holder tx: %v", err)
	}

	budget := 150 * time.Millisecond
	store := NewStore(db, StoreConfig{WriteBudget: budget, Registry: pruneTestRegistry()})

	// (2) Issue the telemetry insert under the held connection.
	start := time.Now()
	outcome, err := store.Insert(context.Background(), storeEvent(pruneKindA, "shed-event", 2000))
	elapsed := time.Since(start)

	if !errors.Is(err, ErrWriteBudget) {
		t.Fatalf("expected ErrWriteBudget, got %v", err)
	}
	if outcome != Shed {
		t.Fatalf("expected Shed outcome, got %v", outcome)
	}
	slack := 850 * time.Millisecond
	if elapsed < budget || elapsed > budget+slack {
		t.Fatalf("expected elapsed in [%v, %v], got %v", budget, budget+slack, elapsed)
	}

	// (3) Release the holder.
	if err := holder.Rollback(); err != nil {
		t.Fatalf("release holder: %v", err)
	}
	time.Sleep(2 * budget)

	// (4) Re-check the table: the shed row must never appear.
	if count := countEvents(t, db, pruneKindA); count != 0 {
		t.Fatalf("expected the shed row to never be inserted, got %d rows", count)
	}
}

// TestCycleReportKindPayloadIsReserializedAndStoredVerbatim asserts the
// payload is rebuilt from validated values and never echoed from the
// client's raw request bytes, and that the store persists exactly the
// payload the kind produced -- the store re-encodes nothing.
func TestCycleReportKindPayloadIsReserializedAndStoredVerbatim(t *testing.T) {
	t.Parallel()

	// The body declares kind, which the strict decode accepts (the envelope
	// declares it so the explicit alias is not rejected) and validation drops:
	// a payload copied from these bytes would still carry it. It also carries
	// the client's own whitespace, which a copy would preserve.
	const rawBody = "{\n" +
		"\t\"kind\": \"cycle_report\",\n" +
		"\t\"trigger_source\":\"foreground_service\",\n" +
		"\t\"cycle_id\":   \"cycle-payload\",\n" +
		"\t\"degraded\":\"events\",\n" +
		"\t\"app_state\":\"background\",\n" +
		"\t\"previous_cycle\":{\"outcome\":\"completed\",\"elapsed_ms\":500},\n" +
		"\t\"counters\":{\"consecutive_unclosed_cycles\":0,\"pending_ops_count\":2,\"cursor\":42},\n" +
		"\t\"recent_events\":[{\"source\":\"sync_cycle\",\"event\":\"ws_opened\",\"cause\":\"timeout\",\"first_at\":1,\"last_at\":2,\"count\":3}]\n" +
		"}"

	// The literal stored payload for rawBody. It is a golden string rather
	// than a re-marshal of the same record on purpose: a comparison between a
	// record and its own re-serialization cannot fail when a tag is removed.
	// Every previous_cycle member rawBody omits stays present as an explicit
	// null, which is what pins the absence of omitempty.
	const wantPayload = `{"cycle_id":"cycle-payload","trigger_source":"foreground_service","app_state":"background","consecutive_unclosed_cycles":0,"pending_ops_count":2,"cursor":42,"recent_events":[{"source":"sync_cycle","event":"ws_opened","cause":"timeout","first_at":1,"last_at":2,"count":3}],"previous_cycle":{"cycle_id":null,"trigger_source":null,"outcome":"completed","last_stage":null,"started_at":null,"elapsed_ms":500,"error_name":null,"native_errcode_byte":null,"error_stage":null,"error_cause":null,"error_fingerprint":null}}`

	validated, err := CycleReportKind{}.Decode([]byte(rawBody))
	if err != nil {
		t.Fatalf("decode cycle report: %v", err)
	}
	if validated.EventID != "cycle-payload" {
		t.Fatalf("expected the validated cycle_id as the idempotency key, got %q", validated.EventID)
	}
	if validated.Degraded == nil || *validated.Degraded != "events" {
		t.Fatalf("expected the validated degraded value to survive, got %v", validated.Degraded)
	}

	// The raw body's own formatting: a copy would carry its newlines and
	// tabs, and encoding/json never emits either byte.
	if bytes.Contains(validated.Payload, []byte("\n")) || bytes.Contains(validated.Payload, []byte("\t")) {
		t.Fatalf("expected a re-serialized payload without the client's raw formatting, got %q", validated.Payload)
	}
	// What the strict decode accepted and validation dropped must not survive
	// into the stored payload, which only validated values can contain.
	if bytes.Contains(validated.Payload, []byte(`"kind"`)) {
		t.Fatalf("expected the dropped kind discriminator to be absent from the payload, got %q", validated.Payload)
	}
	if string(validated.Payload) != wantPayload {
		t.Fatalf("expected the stored payload to be %s, got %s", wantPayload, validated.Payload)
	}

	db := openTelemetryStoreTestDB(t)
	store := NewStore(db, StoreConfig{Registry: NewRegistry(CycleReportKind{})})
	event := Event{DeviceID: "device-1", ReportedAtMS: 5000, Kind: KindCycleReport, Validated: validated}
	if _, err := store.Insert(context.Background(), event); err != nil {
		t.Fatalf("insert cycle report: %v", err)
	}

	var persisted string
	if err := db.QueryRow(`SELECT payload_json FROM device_telemetry_events WHERE kind = ? AND event_id = ?`, KindCycleReport, validated.EventID).Scan(&persisted); err != nil {
		t.Fatalf("query stored payload: %v", err)
	}
	if persisted != string(validated.Payload) {
		t.Fatalf("expected the store to persist the validated payload verbatim, got %q want %q", persisted, validated.Payload)
	}
}
