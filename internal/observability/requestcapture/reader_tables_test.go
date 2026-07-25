package requestcapture

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

// TestResolveCaptureTablesPrefersCurrentGeneration asserts resolveCaptureTables
// picks the transport-neutral names when they exist.
func TestResolveCaptureTablesPrefersCurrentGeneration(t *testing.T) {
	t.Parallel()

	db := openInMemoryDB(t)
	createCurrentGenerationSchema(t, db)

	tables, err := resolveCaptureTables(db)
	if err != nil {
		t.Fatalf("resolve capture tables: %v", err)
	}
	if tables != currentCaptureTables {
		t.Fatalf("expected current generation, got %#v", tables)
	}
}

// TestResolveCaptureTablesFallsBackToPreviousGeneration asserts resolveCaptureTables
// falls back to the previously-named tables when only they exist.
func TestResolveCaptureTablesFallsBackToPreviousGeneration(t *testing.T) {
	t.Parallel()

	db := openInMemoryDB(t)
	createPreviousGenerationSchema(t, db)

	tables, err := resolveCaptureTables(db)
	if err != nil {
		t.Fatalf("resolve capture tables: %v", err)
	}
	if tables != previousCaptureTables {
		t.Fatalf("expected previous generation, got %#v", tables)
	}
}

// TestResolveCaptureTablesPrefersCurrentWhenBothGenerationsExist asserts the
// current generation wins when both table sets are present.
func TestResolveCaptureTablesPrefersCurrentWhenBothGenerationsExist(t *testing.T) {
	t.Parallel()

	db := openInMemoryDB(t)
	createCurrentGenerationSchema(t, db)
	createPreviousGenerationSchema(t, db)

	tables, err := resolveCaptureTables(db)
	if err != nil {
		t.Fatalf("resolve capture tables: %v", err)
	}
	if tables != currentCaptureTables {
		t.Fatalf("expected current generation to win, got %#v", tables)
	}
}

// TestResolveCaptureTablesErrorsWhenNeitherGenerationExists asserts a
// schema-mismatch error when no capture table generation is present.
func TestResolveCaptureTablesErrorsWhenNeitherGenerationExists(t *testing.T) {
	t.Parallel()

	db := openInMemoryDB(t)

	_, err := resolveCaptureTables(db)
	assertRequestCaptureErrorCode(t, err, "schema_mismatch")
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
