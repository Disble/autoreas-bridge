package season

import "autoreas-bridge/internal/persistence"

const (
	seasonsDDL = `
		CREATE TABLE IF NOT EXISTS seasons (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			min_approval_grade INTEGER NOT NULL DEFAULT 4,
			slots INTEGER NOT NULL DEFAULT 12,
			status TEXT NOT NULL DEFAULT 'open',
			selection_confirmed_at INTEGER,
			applied_at INTEGER,
			closed_at INTEGER,
			created_at INTEGER NOT NULL
		)`
	// seasonsSingleOpenIndexDDL enforces the aggregate invariant "at most one
	// open season" at the storage layer via a partial unique index.
	seasonsSingleOpenIndexDDL = `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_single_open ON seasons(status) WHERE status = 'open'`

	seasonAnimesDDL = `
		CREATE TABLE IF NOT EXISTS season_animes (
			id TEXT PRIMARY KEY,
			season_id TEXT NOT NULL,
			raw_name TEXT NOT NULL,
			match_status TEXT NOT NULL DEFAULT 'pending',
			matched_slug TEXT,
			match_candidates_json TEXT,
			availability TEXT NOT NULL DEFAULT 'waiting',
			first_available_at INTEGER,
			anime_id TEXT,
			nota_estreno INTEGER,
			nota_source TEXT,
			nota_pos_estreno INTEGER,
			consideracion TEXT NOT NULL DEFAULT 'none',
			last_checked_at INTEGER,
			created_at INTEGER NOT NULL
		)`
	seasonAnimesSeasonIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_season_animes_season ON season_animes(season_id)`
)

// SchemaTables returns the season-owned bridge table descriptors for the sdd-34
// schema registry. The DDL lives HERE (not in internal/sync) per the
// architecture boundary enforced by tools/checkarchitecture: season owns every
// reference to its tables; the bootstrap composition root only assembles the
// descriptor set. season_animes is created now (SDD-41) and populated by later
// slices (intake, availability, evaluation).
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "seasons",
			CreateDDL: seasonsDDL,
			Indexes:   []string{seasonsSingleOpenIndexDDL},
		},
		{
			Name:      "season_animes",
			CreateDDL: seasonAnimesDDL,
			Indexes:   []string{seasonAnimesSeasonIndexDDL},
		},
	}
}
