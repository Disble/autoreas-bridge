package eventlog

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// openStoreTestDBWithoutSchema creates a SQLite database with no schema
// applied at all -- simulating a bridge database that predates this change,
// so the reader must tolerate a missing runtime_events table.
func openStoreTestDBWithoutSchema(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "no-events.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// TestNewReaderAvailableFalseWhenTableMissing asserts a reader built over a
// handle with no runtime_events table reports Available() false rather than
// erroring -- the presence probe never fails closed.
func TestNewReaderAvailableFalseWhenTableMissing(t *testing.T) {
	t.Parallel()

	db := openStoreTestDBWithoutSchema(t)
	reader := NewReader(db)
	if reader.Available() {
		t.Fatal("expected Available() false when runtime_events is absent")
	}
}
