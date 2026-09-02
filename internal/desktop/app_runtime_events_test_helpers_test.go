package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/persistence"
)

// openRuntimeEventsTestDB opens a temp-file SQLite database carrying only the
// eventlog-owned schema, so eventlog.NewReader's presence probe finds
// runtime_events. Deliberately the EnsureTableSchema path rather than the full
// bridge bootstrap: the runtime-event read seam owns nothing else in the
// schema, and the narrower fixture mirrors eventlog's own store tests.
func openRuntimeEventsTestDB(t *testing.T) *sql.DB {
	t.Helper()
	return openRuntimeEventsTestDBAt(t, filepath.Join(t.TempDir(), "events.db"))
}

// openRuntimeEventsTestDBAt is openRuntimeEventsTestDB against a caller-owned
// path, so a test can close a handle and reopen the same file to prove
// restart survival.
func openRuntimeEventsTestDBAt(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, table := range eventlog.SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
	return db
}

// openDBWithoutRuntimeEventsTable opens a temp-file SQLite database with no
// schema applied at all, standing in for a bridge database that predates the
// runtime-event table.
func openDBWithoutRuntimeEventsTable(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "no-events.db"))
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// seedRuntimeEvent inserts one runtime event through the production store, so
// the fixture rows are shaped exactly as the sink writes them (NULL for the
// unset optional columns, bounded metadata JSON).
func seedRuntimeEvent(t *testing.T, db *sql.DB, record eventlog.EventRecord) {
	t.Helper()
	if err := eventlog.NewStore(db, eventlog.EventStoreConfig{}).InsertEvent(context.Background(), record); err != nil {
		t.Fatalf("seed runtime event %q: %v", record.Message, err)
	}
}

// runtimeEventMessages projects a bound page into its messages, so an ordering
// assertion reads as the sequence under test rather than as index arithmetic.
func runtimeEventMessages(items []contracts.EventRow) []string {
	messages := make([]string, 0, len(items))
	for _, item := range items {
		messages = append(messages, item.Message)
	}
	return messages
}
