package watchhistory

import "testing"

// TestSchemaTablesDescribesWatchHistoryAndCreatesEveryDeclaredIndex asserts
// SchemaTables() declares exactly the watch_history table with its three
// indexes, and that EnsureTableSchema creates all three. schema.go generates
// zero mutants, so this is a structural check rather than a behavior a
// mutant could survive; it also proves the table itself was created, since
// every index DDL targets watch_history and a missing table would fail
// EnsureTableSchema before any index lookup runs.
func TestSchemaTablesDescribesWatchHistoryAndCreatesEveryDeclaredIndex(t *testing.T) {
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

	db := openStoreTestDB(t)
	for _, index := range []string{"idx_watch_history_watched_at", "idx_watch_history_anime", "idx_watch_history_episode"} {
		var name string
		if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, index).Scan(&name); err != nil {
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

	db := openStoreTestDB(t)

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
