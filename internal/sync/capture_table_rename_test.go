package sync

import (
	"database/sql"
	"path/filepath"
	"testing"
)

// seedPreviousGenerationCaptureRow is one hand-built row seeded into the
// previously-named mobile_request_captures table before a rename-migration
// test bootstraps the database.
type seedPreviousGenerationCaptureRow struct {
	requestID       string
	capturedAtMS    int64
	kind            string
	route           string
	transport       string
	deviceID        string
	deviceName      string
	outcome         string
	animeID         sql.NullString
	httpStatus      sql.NullInt64
	payloadJSON     string
	correlationJSON string
	errorCode       string
	responseBody    sql.NullString
	requestHeaders  sql.NullString
	responseHeaders sql.NullString
	durationMS      sql.NullInt64
}

// buildPreviousGenerationCaptureFixture creates a raw SQLite file at path
// holding the previously-named capture tables (all 17 columns), the five
// previously-named indexes, N seeded rows, and metadata stamped at schema
// version 2 -- built entirely by hand, not through bootstrap, so the
// migration test exercises a genuinely pre-existing database.
func buildPreviousGenerationCaptureFixture(t *testing.T, path string, rows []seedPreviousGenerationCaptureRow) {
	t.Helper()
	db, err := sql.Open(sqliteDriverName, path)
	if err != nil {
		t.Fatalf("open fixture db: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close fixture db: %v", err)
		}
	}()

	ddls := []string{
		`CREATE TABLE mobile_request_captures (
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
			error_code TEXT NOT NULL DEFAULT '',
			response_body TEXT,
			request_headers TEXT,
			response_headers TEXT,
			duration_ms INTEGER
		)`,
		`CREATE INDEX idx_mobile_request_captures_time ON mobile_request_captures (captured_at_ms DESC, request_id DESC)`,
		`CREATE INDEX idx_mobile_request_captures_device_time ON mobile_request_captures (device_id, captured_at_ms DESC, request_id DESC)`,
		`CREATE INDEX idx_mobile_request_captures_anime_time ON mobile_request_captures (anime_id, captured_at_ms DESC, request_id DESC)`,
		`CREATE INDEX idx_mobile_request_captures_route_time ON mobile_request_captures (route, captured_at_ms DESC, request_id DESC)`,
		`CREATE INDEX idx_mobile_request_captures_status_time ON mobile_request_captures (http_status, captured_at_ms DESC, request_id DESC)`,
		`CREATE TABLE mobile_request_capture_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
	}
	for _, ddl := range ddls {
		if _, err := db.Exec(ddl); err != nil {
			t.Fatalf("exec fixture ddl %q: %v", ddl, err)
		}
	}
	if _, err := db.Exec(`INSERT INTO mobile_request_capture_metadata (key, value) VALUES ('mobile_request_capture_schema_version', '2')`); err != nil {
		t.Fatalf("seed fixture metadata: %v", err)
	}
	for _, row := range rows {
		if _, err := db.Exec(`
			INSERT INTO mobile_request_captures (
				request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
				anime_id, http_status, payload_json, correlation_json, error_code,
				response_body, request_headers, response_headers, duration_ms
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, row.requestID, row.capturedAtMS, row.kind, row.route, row.transport, row.deviceID, row.deviceName, row.outcome,
			row.animeID, row.httpStatus, row.payloadJSON, row.correlationJSON, row.errorCode,
			row.responseBody, row.requestHeaders, row.responseHeaders, row.durationMS); err != nil {
			t.Fatalf("seed fixture row %q: %v", row.requestID, err)
		}
	}
}

// sampleCaptureRows builds a deterministic set of previous-generation seed
// rows, exercising both nullable and populated optional columns.
func sampleCaptureRows() []seedPreviousGenerationCaptureRow {
	return []seedPreviousGenerationCaptureRow{
		{
			requestID: "req-1", capturedAtMS: 100, kind: "patch", route: "/api/animes/anime-1", transport: "http",
			deviceID: "device-1", deviceName: "Phone", outcome: "accepted",
			animeID: sql.NullString{String: "anime-1", Valid: true}, httpStatus: sql.NullInt64{Int64: 200, Valid: true},
			payloadJSON: `{}`, correlationJSON: `{"operation_refs":[]}`, errorCode: "",
			responseBody: sql.NullString{String: `{"ok":true}`, Valid: true},
			durationMS:   sql.NullInt64{Int64: 42, Valid: true},
		},
		{
			requestID: "req-2", capturedAtMS: 200, kind: "reconcile", route: "/api/sync/reconcile", transport: "ws",
			deviceID: "device-2", deviceName: "Tablet", outcome: "rejected",
			payloadJSON: `{"a":1}`, correlationJSON: `{"operation_refs":[]}`, errorCode: "apply_pending_failed",
		},
	}
}

// TestCaptureTableRenamePreservesExistingRows asserts bootstrap renames the
// previously-named capture tables in place, preserving every row/column
// value, dropping the stale indexes, creating the current ones, and
// stamping the current metadata key/version.
func TestCaptureTableRenamePreservesExistingRows(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	seeded := sampleCaptureRows()
	buildPreviousGenerationCaptureFixture(t, path, seeded)

	db, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("bootstrap renamed db: %v", err)
	}
	defer closeTestDB(t, db)

	assertCaptureRowsSurvived(t, db, seeded)

	for _, table := range []string{"mobile_request_captures", "mobile_request_capture_metadata"} {
		if tableExists(t, db, table) {
			t.Fatalf("expected previously-named table %q to no longer exist", table)
		}
	}
	for _, index := range []string{
		"idx_mobile_request_captures_time", "idx_mobile_request_captures_device_time",
		"idx_mobile_request_captures_anime_time", "idx_mobile_request_captures_route_time",
		"idx_mobile_request_captures_status_time",
	} {
		if indexExists(t, db, index) {
			t.Fatalf("expected stale index %q to no longer exist", index)
		}
	}
	for _, index := range []string{
		"idx_request_captures_time", "idx_request_captures_device_time",
		"idx_request_captures_anime_time", "idx_request_captures_route_time",
		"idx_request_captures_status_time",
	} {
		if !indexExists(t, db, index) {
			t.Fatalf("expected current index %q to exist", index)
		}
	}

	var version string
	if err := db.QueryRow(`SELECT value FROM request_capture_metadata WHERE key = 'request_capture_schema_version'`).Scan(&version); err != nil {
		t.Fatalf("read renamed schema version: %v", err)
	}
	if version != "5" {
		t.Fatalf("expected schema version 5 after rename, got %q", version)
	}
	var staleKeyCount int
	if err := db.QueryRow(`SELECT count(*) FROM request_capture_metadata WHERE key = 'mobile_request_capture_schema_version'`).Scan(&staleKeyCount); err != nil {
		t.Fatalf("count stale metadata key: %v", err)
	}
	if staleKeyCount != 0 {
		t.Fatalf("expected the previously-named metadata key to be gone, found %d", staleKeyCount)
	}
}

// TestCaptureTableRenameFreshInstallSkipsRename asserts a brand-new database
// gets the current-generation tables directly, at version 4, with no
// previously-named object ever created.
func TestCaptureTableRenameFreshInstallSkipsRename(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("bootstrap fresh db: %v", err)
	}
	defer closeTestDB(t, db)

	if !tableExists(t, db, "request_captures") || !tableExists(t, db, "request_capture_metadata") {
		t.Fatal("expected current-generation capture tables to exist on a fresh install")
	}
	for _, table := range []string{"mobile_request_captures", "mobile_request_capture_metadata"} {
		if tableExists(t, db, table) {
			t.Fatalf("expected previously-named table %q to never be created on a fresh install", table)
		}
	}
	var version string
	if err := db.QueryRow(`SELECT value FROM request_capture_metadata WHERE key = 'request_capture_schema_version'`).Scan(&version); err != nil {
		t.Fatalf("read fresh schema version: %v", err)
	}
	if version != "5" {
		t.Fatalf("expected fresh schema version 5, got %q", version)
	}
}

// TestCaptureTableRenameNeverOrphansDataBehindAnEmptyTable is the regression
// test for the EnsureTableSchema/Migrate trap: after bootstrapping a
// populated previous-generation database, there must be no empty
// request_captures sitting alongside a still-populated mobile_request_captures,
// and every seeded row must be reachable through the renamed table.
func TestCaptureTableRenameNeverOrphansDataBehindAnEmptyTable(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	seeded := sampleCaptureRows()
	buildPreviousGenerationCaptureFixture(t, path, seeded)

	db, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("bootstrap renamed db: %v", err)
	}
	defer closeTestDB(t, db)

	if tableExists(t, db, "mobile_request_captures") {
		t.Fatal("expected the previously-named table to no longer exist -- data must not be orphaned behind it")
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM request_captures`).Scan(&count); err != nil {
		t.Fatalf("count renamed rows: %v", err)
	}
	if count != len(seeded) {
		t.Fatalf("expected request_captures to hold all %d seeded rows reachable, got %d", len(seeded), count)
	}
}

// TestCaptureTableRenameIsIdempotent asserts bootstrapping an already-renamed
// database a second time performs no rename, creates no duplicate rows or
// indexes, and leaves the schema version unchanged.
func TestCaptureTableRenameIsIdempotent(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	seeded := sampleCaptureRows()
	buildPreviousGenerationCaptureFixture(t, path, seeded)

	first, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("first bootstrap: %v", err)
	}
	closeTestDB(t, first)

	second, err := OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("second bootstrap: %v", err)
	}
	defer closeTestDB(t, second)

	assertCaptureRowsSurvived(t, second, seeded)

	var indexCount int
	if err := second.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_request_captures_%'`).Scan(&indexCount); err != nil {
		t.Fatalf("count current indexes: %v", err)
	}
	if indexCount != 5 {
		t.Fatalf("expected exactly 5 current capture indexes after a repeated bootstrap, got %d", indexCount)
	}
	var version string
	if err := second.QueryRow(`SELECT value FROM request_capture_metadata WHERE key = 'request_capture_schema_version'`).Scan(&version); err != nil {
		t.Fatalf("read schema version: %v", err)
	}
	if version != "5" {
		t.Fatalf("expected schema version to remain 5, got %q", version)
	}
}

// indexExists reports whether SQLite contains the named index.
func indexExists(t *testing.T, db *sql.DB, name string) bool {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, name).Scan(&count); err != nil {
		t.Fatalf("query sqlite_master for index %q: %v", name, err)
	}
	return count > 0
}

// assertCaptureRowsSurvived asserts every seeded row is present in
// request_captures with identical column values.
func assertCaptureRowsSurvived(t *testing.T, db *sql.DB, seeded []seedPreviousGenerationCaptureRow) {
	t.Helper()
	for _, want := range seeded {
		var got seedPreviousGenerationCaptureRow
		err := db.QueryRow(`
			SELECT request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
				anime_id, http_status, payload_json, correlation_json, error_code,
				response_body, request_headers, response_headers, duration_ms
			FROM request_captures WHERE request_id = ?
		`, want.requestID).Scan(
			&got.requestID, &got.capturedAtMS, &got.kind, &got.route, &got.transport, &got.deviceID, &got.deviceName, &got.outcome,
			&got.animeID, &got.httpStatus, &got.payloadJSON, &got.correlationJSON, &got.errorCode,
			&got.responseBody, &got.requestHeaders, &got.responseHeaders, &got.durationMS,
		)
		if err != nil {
			t.Fatalf("read renamed row %q: %v", want.requestID, err)
		}
		if got != want {
			t.Fatalf("expected row %q to survive the rename unchanged, want=%#v got=%#v", want.requestID, want, got)
		}
	}
}
