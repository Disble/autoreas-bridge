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
			available_chapters INTEGER NOT NULL DEFAULT 0,
			anime_id TEXT,
			premiere_grade INTEGER,
			grade_source TEXT,
			post_season_grade INTEGER,
			rated_at INTEGER,
			skip_grading INTEGER NOT NULL DEFAULT 0,
			consideration TEXT NOT NULL DEFAULT 'none',
			last_checked_at INTEGER,
			created_at INTEGER NOT NULL
		)`
	seasonAnimesSeasonIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_season_animes_season ON season_animes(season_id)`

	// SDD-44 renamed the Spanish grade columns to English and added the
	// grade-capture columns. Existing installs (created at SDD-41) are migrated
	// column-by-column: a RENAME when the old Spanish column is still present, an
	// ADD for the genuinely new columns. Probing the NEW column name makes each
	// step idempotent (fresh installs already have it via CreateDDL).
	seasonAnimesPremiereGradeDDL   = `ALTER TABLE season_animes RENAME COLUMN nota_estreno TO premiere_grade`
	seasonAnimesGradeSourceDDL     = `ALTER TABLE season_animes RENAME COLUMN nota_source TO grade_source`
	seasonAnimesPostSeasonGradeDDL = `ALTER TABLE season_animes RENAME COLUMN nota_pos_estreno TO post_season_grade`
	seasonAnimesRatedAtDDL         = `ALTER TABLE season_animes ADD COLUMN rated_at INTEGER`
	seasonAnimesSkipGradingDDL     = `ALTER TABLE season_animes ADD COLUMN skip_grading INTEGER NOT NULL DEFAULT 0`

	// SDD-45 renamed the Spanish consideration column to English (dormant since
	// SDD-41, never written before now).
	seasonAnimesConsiderationDDL = `ALTER TABLE season_animes RENAME COLUMN consideracion TO consideration`

	// SDD-43c added the available-chapter count surfaced by the availability watch.
	seasonAnimesAvailableChaptersDDL = `ALTER TABLE season_animes ADD COLUMN available_chapters INTEGER NOT NULL DEFAULT 0`
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
			ColumnAdds: []persistence.ColumnMigration{
				{Column: "premiere_grade", AlterDDL: seasonAnimesPremiereGradeDDL},
				{Column: "grade_source", AlterDDL: seasonAnimesGradeSourceDDL},
				{Column: "post_season_grade", AlterDDL: seasonAnimesPostSeasonGradeDDL},
				{Column: "rated_at", AlterDDL: seasonAnimesRatedAtDDL},
				{Column: "skip_grading", AlterDDL: seasonAnimesSkipGradingDDL},
				{Column: "consideration", AlterDDL: seasonAnimesConsiderationDDL},
				{Column: "available_chapters", AlterDDL: seasonAnimesAvailableChaptersDDL},
			},
			Indexes: []string{seasonAnimesSeasonIndexDDL},
		},
	}
}
