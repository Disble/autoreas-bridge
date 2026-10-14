package episodes_test

import (
	"bytes"
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
)

// execAll runs setup statements that break the database on purpose.
func execAll(statements ...string) func(*testing.T, *sql.DB) {
	return func(t *testing.T, db *sql.DB) {
		t.Helper()
		for _, statement := range statements {
			if _, err := db.Exec(statement); err != nil {
				t.Fatalf("break database with %q: %v", statement, err)
			}
		}
	}
}

// closeDB closes the database so the next call fails to get a connection.
func closeDB(t *testing.T, db *sql.DB) {
	t.Helper()
	if err := db.Close(); err != nil {
		t.Fatalf("close database: %v", err)
	}
}

// storeWrite runs fillOne against a store over db.
func storeWrite(ctx context.Context, db *sql.DB) (int, error) {
	return fillOne(ctx, episodes.NewStore(db, (&testClock{ms: 1}).now))
}

// exportAll runs the backup export over db into a discarded buffer.
func exportAll(ctx context.Context, db *sql.DB) (int, error) {
	return episodes.ExportEpisodeDurations(db)(ctx, &bytes.Buffer{})
}

// importOne runs the backup import over db with one valid record.
func importOne(ctx context.Context, db *sql.DB) (int, error) {
	line := `{"anime_id":"a","episode":1,"duration_ms":1000,"source":"measured","updated_at_ms":1}` + "\n"
	return episodes.ImportEpisodeDurations(db, time.Now)(ctx, strings.NewReader(line))
}

// TestDatabaseFailuresReturnAnErrorAndAZeroCount forces each real SQLite
// failure a write, export or import can meet, and asserts the error and a
// zero count, never a partial or invented one.
func TestDatabaseFailuresReturnAnErrorAndAZeroCount(t *testing.T) {
	cases := []struct {
		name    string
		breakDB func(*testing.T, *sql.DB)
		act     func(context.Context, *sql.DB) (int, error)
	}{
		{name: "write cannot begin on a closed database", breakDB: closeDB, act: storeWrite},
		{name: "write without the durations table", breakDB: execAll(`DROP TABLE anime_episode_durations`), act: storeWrite},
		{name: "write cannot mark without the pending table", breakDB: execAll(`DROP TABLE durations_pending_announce`), act: storeWrite},
		{
			// A deferred foreign key is checked at COMMIT, so the mark insert
			// succeeds and only the commit fails.
			name: "write cannot commit a deferred foreign key violation",
			breakDB: execAll(
				`PRAGMA foreign_keys = ON`,
				`CREATE TABLE fk_parent (id TEXT PRIMARY KEY)`,
				`DROP TABLE durations_pending_announce`,
				`CREATE TABLE durations_pending_announce (
					anime_id TEXT PRIMARY KEY REFERENCES fk_parent(id) DEFERRABLE INITIALLY DEFERRED,
					marked_at_ms INTEGER NOT NULL)`,
			),
			act: storeWrite,
		},
		{name: "export cannot query a closed database", breakDB: closeDB, act: exportAll},
		{
			name: "export cannot scan a non-numeric episode",
			breakDB: execAll(
				`DROP TABLE anime_episode_durations`,
				`CREATE TABLE anime_episode_durations (anime_id, episode, duration_ms, source, updated_at_ms)`,
				`INSERT INTO anime_episode_durations VALUES ('a', 'one', 1000, 'measured', 1)`,
			),
			act: exportAll,
		},
		{name: "import cannot begin on a closed database", breakDB: closeDB, act: importOne},
		{name: "import cannot delete without the durations table", breakDB: execAll(`DROP TABLE anime_episode_durations`), act: importOne},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := openTestDB(t)
			tc.breakDB(t, db)
			if n, err := tc.act(context.Background(), db); n != 0 || err == nil {
				t.Fatalf("result = (%d, %v), want (0, an error)", n, err)
			}
		})
	}
}
