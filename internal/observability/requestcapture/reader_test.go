package requestcapture

import (
	"context"
	"database/sql"
	"net/http"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

func TestMissingDBReturnsUnavailable(t *testing.T) {
	t.Parallel()

	_, err := OpenReadOnlyDB(filepath.Join(t.TempDir(), "missing.db"))
	assertRequestCaptureErrorCode(t, err, "unavailable")
}

func TestReadOnlyDBEnforcesQueryOnly(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	reader, err := OpenReadOnlyDB(path)
	if err != nil {
		t.Fatalf("open read-only db: %v", err)
	}
	defer func() { _ = reader.Close() }()

	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		t.Fatalf("verify query_only: %v", err)
	}

	if _, err := reader.DB().Exec(`DELETE FROM request_captures`); err == nil {
		t.Fatal("expected write attempt to fail in query-only mode")
	}
	if countRows(t, reader.DB(), "request_captures") != 0 {
		t.Fatal("expected capture row count to remain unchanged")
	}
}

// TestOpenReadOnlyDBAcceptsPreviousGenerationAtVersion2 asserts the reader
// opens an un-migrated database still holding the previously-named tables at
// schema version 2.
func TestOpenReadOnlyDBAcceptsPreviousGenerationAtVersion2(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	buildCaptureFixtureFile(t, path, previousCaptureTables, "2")

	reader, err := OpenReadOnlyDB(path)
	if err != nil {
		t.Fatalf("open previous-generation db: %v", err)
	}
	defer func() { _ = reader.Close() }()
	if reader.Tables() != previousCaptureTables {
		t.Fatalf("expected previous generation resolved, got %#v", reader.Tables())
	}
}

// TestOpenReadOnlyDBAcceptsCurrentGenerationAtVersion3 asserts the reader
// opens a migrated database holding the transport-neutral tables at schema
// version 3.
func TestOpenReadOnlyDBAcceptsCurrentGenerationAtVersion3(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	buildCaptureFixtureFile(t, path, currentCaptureTables, "3")

	reader, err := OpenReadOnlyDB(path)
	if err != nil {
		t.Fatalf("open current-generation db: %v", err)
	}
	defer func() { _ = reader.Close() }()
	if reader.Tables() != currentCaptureTables {
		t.Fatalf("expected current generation resolved, got %#v", reader.Tables())
	}
}

// TestOpenReadOnlyDBFailsClosedWhenNeitherGenerationExists asserts a database
// with no capture table at all is rejected as a schema mismatch.
func TestOpenReadOnlyDBFailsClosedWhenNeitherGenerationExists(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite file: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE unrelated (id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatalf("create unrelated table: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close sqlite file: %v", err)
	}

	_, err = OpenReadOnlyDB(path)
	assertRequestCaptureErrorCode(t, err, "schema_mismatch")
}

// TestIsSupportedCaptureSchemaVersionAcceptsAllFourGenerations asserts the
// reader tolerates every stored schema version produced by this or an older
// release and rejects anything else.
func TestIsSupportedCaptureSchemaVersionAcceptsAllFourGenerations(t *testing.T) {
	t.Parallel()

	for _, version := range []string{"1", "2", "3", "4", "5"} {
		if !isSupportedCaptureSchemaVersion(version) {
			t.Fatalf("expected version %q to be supported", version)
		}
	}
	for _, version := range []string{"", "99"} {
		if isSupportedCaptureSchemaVersion(version) {
			t.Fatalf("expected version %q to be rejected", version)
		}
	}
}

// buildCaptureFixtureFile creates a real (file-backed) SQLite database at
// path holding one capture table generation, stamped at the given schema
// version, built by hand rather than through bootstrap.
func buildCaptureFixtureFile(t *testing.T, path string, tables captureTables, version string) {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite file: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close sqlite file: %v", err)
		}
	}()
	if _, err := db.Exec(`CREATE TABLE ` + tables.captures + ` (
		request_id TEXT PRIMARY KEY,
		captured_at_ms INTEGER NOT NULL,
		kind TEXT NOT NULL,
		route TEXT NOT NULL,
		transport TEXT NOT NULL,
		device_id TEXT NOT NULL,
		device_name TEXT NOT NULL,
		outcome TEXT NOT NULL,
		anime_id TEXT,
		http_status INTEGER,
		payload_json TEXT NOT NULL,
		correlation_json TEXT NOT NULL,
		error_code TEXT NOT NULL DEFAULT ''
	)`); err != nil {
		t.Fatalf("create %s: %v", tables.captures, err)
	}
	if _, err := db.Exec(`CREATE TABLE ` + tables.metadata + ` (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatalf("create %s: %v", tables.metadata, err)
	}
	if _, err := db.Exec(`INSERT INTO `+tables.metadata+` (key, value) VALUES (?, ?)`, tables.versionKey, version); err != nil {
		t.Fatalf("seed %s: %v", tables.metadata, err)
	}
}

func TestMutationIntentReturnsUnsupported(t *testing.T) {
	t.Parallel()

	err := ValidateToolName("delete_mobile_request_context")
	assertRequestCaptureErrorCode(t, err, "unsupported")
}

func TestMalformedRowSkippedDuringExactGet(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES
			('req-good', 20, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{"status":1}', '{"operation_refs":[]}'),
			('req-bad', 10, 'patch', '/api/animes/anime-2', 'http', 'device-2', 'Phone', 'accepted', '{bad', '{"operation_refs":[]}')
	`)
	if err != nil {
		t.Fatalf("seed captures: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-good")
	if err != nil {
		t.Fatalf("get capture: %v", err)
	}
	if !result.Found || result.Item.RequestID != "req-good" {
		t.Fatalf("expected exact get to find req-good, got %#v", result)
	}
	if result.MalformedRowsSkipped != 1 {
		t.Fatalf("expected malformed_rows_skipped 1, got %d", result.MalformedRowsSkipped)
	}
	if result.WarningCount != 1 {
		t.Fatalf("expected warning_count 1, got %d", result.WarningCount)
	}
}

func TestNullCorrelationSlicesNormalizedToEmptyArrays(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES
			('req-null', 10, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{}', '{"changelog_ids":null,"operation_refs":null,"conflict_ids":null,"activity_ids":null}')
	`)
	if err != nil {
		t.Fatalf("seed capture: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-null")
	if err != nil {
		t.Fatalf("get capture: %v", err)
	}
	if !result.Found {
		t.Fatal("expected capture to be found")
	}
	if result.Item.Correlations.ChangelogIDs == nil || len(result.Item.Correlations.ChangelogIDs) != 0 {
		t.Fatalf("expected empty changelog_ids, got %v", result.Item.Correlations.ChangelogIDs)
	}
	if result.Item.Correlations.OperationRefs == nil || len(result.Item.Correlations.OperationRefs) != 0 {
		t.Fatalf("expected empty operation_refs, got %v", result.Item.Correlations.OperationRefs)
	}
	if result.Item.Correlations.ConflictIDs == nil || len(result.Item.Correlations.ConflictIDs) != 0 {
		t.Fatalf("expected empty conflict_ids, got %v", result.Item.Correlations.ConflictIDs)
	}
	if result.Item.Correlations.ActivityIDs == nil || len(result.Item.Correlations.ActivityIDs) != 0 {
		t.Fatalf("expected empty activity_ids, got %v", result.Item.Correlations.ActivityIDs)
	}
	if result.Item.Payload == nil {
		t.Fatal("expected empty payload map, got nil")
	}
}

// assertRequestCaptureErrorCode asserts that err is a request capture error with the wanted code.
func assertRequestCaptureErrorCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error")
	}
	captureErr, ok := err.(Error)
	if !ok {
		t.Fatalf("expected request capture error, got %T (%v)", err, err)
	}
	if captureErr.Code != want {
		t.Fatalf("expected code %q, got %#v", want, captureErr)
	}
	if captureErr.HTTPStatus == 0 {
		t.Fatalf("expected error to include http status, got %#v", captureErr)
	}
	if want == "unsupported" && captureErr.HTTPStatus != http.StatusMethodNotAllowed {
		t.Fatalf("expected method-not-allowed status for unsupported tool, got %#v", captureErr)
	}
}
