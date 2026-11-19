package requestcapture

import (
	"database/sql"
	"testing"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// TestResolveCaptureTablesFollowsTheGenerationsPresent grows one schema: with no
// capture table generation resolveCaptureTables is a schema mismatch, with only
// the previously-named tables it falls back to them, and once the
// transport-neutral tables exist too the current generation wins.
func TestResolveCaptureTablesFollowsTheGenerationsPresent(t *testing.T) {
	t.Parallel()

	db := openInMemoryDB(t)
	db.SetMaxOpenConns(1)

	_, err := resolveCaptureTables(db)
	assertRequestCaptureErrorCode(t, err, "schema_mismatch")

	createPreviousGenerationSchema(t, db)
	tables, err := resolveCaptureTables(db)
	if err != nil {
		t.Fatalf("resolve capture tables: %v", err)
	}
	if tables != previousCaptureTables {
		t.Fatalf("expected previous generation, got %#v", tables)
	}

	createCurrentGenerationSchema(t, db)
	tables, err = resolveCaptureTables(db)
	if err != nil {
		t.Fatalf("resolve capture tables: %v", err)
	}
	if tables != currentCaptureTables {
		t.Fatalf("expected current generation to win, got %#v", tables)
	}
}

// openInMemoryDB opens a fresh in-memory SQLite handle for resolution tests.
func openInMemoryDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// createCurrentGenerationSchema creates the transport-neutral capture tables
// (no rows required for name-resolution tests).
func createCurrentGenerationSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`CREATE TABLE request_captures (request_id TEXT PRIMARY KEY)`); err != nil {
		t.Fatalf("create request_captures: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE request_capture_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatalf("create request_capture_metadata: %v", err)
	}
}

// createPreviousGenerationSchema creates the previously-named capture tables
// (no rows required for name-resolution tests).
func createPreviousGenerationSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	if _, err := db.Exec(`CREATE TABLE mobile_request_captures (request_id TEXT PRIMARY KEY)`); err != nil {
		t.Fatalf("create mobile_request_captures: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE mobile_request_capture_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatalf("create mobile_request_capture_metadata: %v", err)
	}
}
