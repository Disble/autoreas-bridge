// Package watchhistory owns the permanent, per-episode watch log
// (watch_history) and the one pure derivation function every write path and
// the one-shot backfill agree on (design.md D1-D2). It is a new bounded
// context: no other package may write the audit log's replayed rows into
// this table directly, and no other package may reference the table by
// name (enforced by tools/checkarchitecture's second owned-table rule).
package watchhistory

import "autoreas-bridge/internal/persistence"

const (
	watchHistoryDDL = `
		CREATE TABLE IF NOT EXISTS watch_history (
			id                 INTEGER PRIMARY KEY AUTOINCREMENT,
			anime_id           TEXT    NOT NULL,
			anime_name         TEXT    NOT NULL,
			episode            INTEGER NOT NULL,
			cycle              INTEGER NOT NULL,
			watched_at_ms      INTEGER NOT NULL,
			source             TEXT    NOT NULL,
			source_activity_id INTEGER
		)`
	watchHistoryWatchedAtIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history(watched_at_ms DESC, id DESC)`
	watchHistoryAnimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_watch_history_anime ON watch_history(anime_id, watched_at_ms DESC, id DESC)`
	// watchHistoryEpisodeIndexDDL is the natural key (anime_id, cycle,
	// episode): it makes D2a's contiguity invariant structural rather than
	// merely tested (design.md's "Interfaces / Contracts" rationale).
	watchHistoryEpisodeIndexDDL = `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_history_episode ON watch_history(anime_id, cycle, episode)`
)

// SchemaTables returns the watch-history-owned bridge table descriptor for
// the sdd-34 schema registry. watch_history is create-only: no ColumnAdds,
// no Migrate -- the table is born at its current shape, and retention is
// permanent (no prune call exists anywhere in this package).
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "watch_history",
			CreateDDL: watchHistoryDDL,
			Indexes: []string{
				watchHistoryWatchedAtIndexDDL,
				watchHistoryAnimeIndexDDL,
				watchHistoryEpisodeIndexDDL,
			},
		},
	}
}
