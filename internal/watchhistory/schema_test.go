package watchhistory

import (
	"database/sql"
	"testing"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side
	// effect and removing it turns every sql.Open("sqlite", ...) here into a
	// runtime error.
	_ "modernc.org/sqlite"
)

// openSchemaTestDB opens an in-memory SQLite database for a schema test.
func openSchemaTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// ensureWatchHistorySchema applies every descriptor SchemaTables() declares,
// failing the test on any error.
func ensureWatchHistorySchema(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, table := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
}

// TestSchemaTablesReturnsWatchHistoryDescriptor asserts SchemaTables()
// declares exactly the watch_history table with its three indexes.
func TestSchemaTablesReturnsWatchHistoryDescriptor(t *testing.T) {
	t.Parallel()

	tables := SchemaTables()
	if len(tables) != 1 {
		t.Fatalf("expected exactly one table descriptor, got %d", len(tables))
	}
	if tables[0].Name != "watch_history" {
		t.Fatalf("expected table name 'watch_history', got %q", tables[0].Name)
	}
	if len(tables[0].Indexes) != 3 {
		t.Fatalf("expected 3 declared indexes, got %d: %v", len(tables[0].Indexes), tables[0].Indexes)
	}
}

// TestEnsureTableSchemaCreatesEveryDeclaredIndex asserts all three declared
// indexes exist after EnsureTableSchema runs. It also proves the table itself
// was created: every index DDL targets watch_history, so a missing table makes
// EnsureTableSchema fail before any index lookup runs.
func TestEnsureTableSchemaCreatesEveryDeclaredIndex(t *testing.T) {
	t.Parallel()

	db := openSchemaTestDB(t)
	ensureWatchHistorySchema(t, db)

	for _, index := range []string{"idx_watch_history_watched_at", "idx_watch_history_anime", "idx_watch_history_episode"} {
		var name string
		err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, index).Scan(&name)
		if err != nil {
			t.Fatalf("index %s not found: %v", index, err)
		}
	}
}

// TestUniqueEpisodeIndexRejectsDuplicateWithinOneCycle asserts the
// (anime_id, cycle, episode) unique index rejects a second row for the same
// triple, which is the constraint "An Episode Is Never Recorded Twice
// Within A Cycle" depends on structurally.
func TestUniqueEpisodeIndexRejectsDuplicateWithinOneCycle(t *testing.T) {
	t.Parallel()

	db := openSchemaTestDB(t)
	ensureWatchHistorySchema(t, db)

	const insert = `INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source) VALUES (?, ?, ?, ?, ?, ?)`
	if _, err := db.Exec(insert, "anime-1", "Anime One", 8, 2, 1000, "desktop"); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	if _, err := db.Exec(insert, "anime-1", "Anime One", 8, 2, 2000, "desktop"); err == nil {
		t.Fatal("expected the unique (anime_id, cycle, episode) index to reject a duplicate")
	}

	// A different cycle for the same anime and episode MUST succeed --
	// "A New Cycle Records Its Own Copy Of An Episode".
	if _, err := db.Exec(insert, "anime-1", "Anime One", 8, 3, 3000, "desktop"); err != nil {
		t.Fatalf("expected a new cycle to accept the same episode number, got %v", err)
	}
}
