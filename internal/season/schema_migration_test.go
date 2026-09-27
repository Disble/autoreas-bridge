package season

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"

	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/season/domain"
)

// oldSeasonAnimesDDL is the SDD-41 season_animes shape, BEFORE SDD-44 added the
// grade-capture columns. It stands in for an existing install's live table.
const oldSeasonAnimesDDL = `
	CREATE TABLE season_animes (
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

// legacySeasonsDDL is the oldest seasons shape: it predates ordering_draft_json
// (SDD-46) and closure_json (P3). It stands in for an existing install's live
// table so the additive migrations are exercised against a real legacy schema.
const legacySeasonsDDL = `
	CREATE TABLE seasons (
		id TEXT PRIMARY KEY, name TEXT NOT NULL, min_approval_grade INTEGER NOT NULL DEFAULT 4,
		slots INTEGER NOT NULL DEFAULT 12, status TEXT NOT NULL DEFAULT 'open',
		selection_confirmed_at INTEGER, applied_at INTEGER, closed_at INTEGER, created_at INTEGER NOT NULL)`

func TestSeasonAnimesAdditiveMigrationOnExistingInstall(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })

	// Simulate an existing install: the pre-SDD-44 table already exists.
	mustExec(t, db, "create legacy seasons", legacySeasonsDDL)
	if _, err := db.Exec(oldSeasonAnimesDDL); err != nil {
		t.Fatalf("create legacy season_animes: %v", err)
	}

	// Applying the current schema must ADD rated_at + skip_grading, not fail.
	for _, tbl := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, tbl); err != nil {
			t.Fatalf("EnsureTableSchema %s: %v", tbl.Name, err)
		}
	}

	// The store now round-trips a grade against the migrated table.
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.CreateSeason(ctx, domain.NewSeason("s-1", "Julio 2026", time.UnixMilli(0))); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	sa := domain.NewSeasonAnime("sa-1", "s-1", "Anime A", time.UnixMilli(0))
	if err := store.CreateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("CreateSeasonAnime after migration: %v", err)
	}
	got, _ := store.SeasonAnimeByID(ctx, "sa-1")
	got.ApplyGrade(4, domain.GradeSourceMobileSync, time.UnixMilli(10))
	if err := store.UpdateSeasonAnime(ctx, *got); err != nil {
		t.Fatalf("UpdateSeasonAnime after migration: %v", err)
	}
	reread, _ := store.SeasonAnimeByID(ctx, "sa-1")
	if reread.Grade != 4 || reread.RatedAt == nil {
		t.Fatalf("grade not persisted after migration: %+v", reread)
	}
}

// preEpisodeSeasonAnimesDDL is the SDD-43c/44/45 season_animes shape, BEFORE
// SDD-52 renamed available_chapters to available_episodes. It stands in for an
// existing install's live table, which already carries the SDD-43c column.
const preEpisodeSeasonAnimesDDL = `
	CREATE TABLE season_animes (
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

// TestSeasonAnimesAvailableEpisodesRenameMigration verifies the SDD-52
// available_chapters -> available_episodes rename (D3): an existing install
// keeps its value across the rename, running the migration twice is a no-op,
// and a fresh install never sees the old column name.
func TestSeasonAnimesAvailableEpisodesRenameMigration(t *testing.T) {
	db := openMigrationTestDB(t, "bridge.db")

	// Simulate an existing install: the pre-SDD-52 table already exists, with a
	// populated available_chapters value.
	mustExec(t, db, "create legacy seasons", `CREATE TABLE seasons (
		id TEXT PRIMARY KEY, name TEXT NOT NULL, min_approval_grade INTEGER NOT NULL DEFAULT 4,
		slots INTEGER NOT NULL DEFAULT 12, status TEXT NOT NULL DEFAULT 'open',
		selection_confirmed_at INTEGER, applied_at INTEGER, closed_at INTEGER,
		ordering_draft_json TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`)
	mustExec(t, db, "create legacy season_animes", preEpisodeSeasonAnimesDDL)
	mustExec(t, db, "seed available_chapters value", `INSERT INTO season_animes
		(id, season_id, raw_name, available_chapters, created_at)
		VALUES ('sa-1', 's-1', 'Anime A', 5, 0)`)

	// Applying the current schema must RENAME available_chapters to
	// available_episodes, preserving the seeded value.
	ensureSeasonSchema(t, db, "first run")
	cols := mustSeasonAnimesColumns(t, db, "after rename")
	if containsColumnName(cols, "available_chapters") {
		t.Fatalf("available_chapters must not survive the rename, got columns: %v", cols)
	}
	if !containsColumnName(cols, "available_episodes") {
		t.Fatalf("available_episodes missing after migration, got columns: %v", cols)
	}
	assertAvailableEpisodes(t, db, "sa-1", 5)

	// Running the migration a second time must be a no-op: no error, no
	// duplicate column, value still intact.
	ensureSeasonSchema(t, db, "second run")
	cols = mustSeasonAnimesColumns(t, db, "after second run")
	if n := countColumnName(cols, "available_episodes"); n != 1 {
		t.Fatalf("available_episodes must appear exactly once, got %d in %v", n, cols)
	}

	// A fresh install (CreateDDL only) must have available_episodes from the
	// start and never see available_chapters.
	freshDB := openMigrationTestDB(t, "fresh.db")
	ensureSeasonSchema(t, freshDB, "fresh install")
	freshCols := mustSeasonAnimesColumns(t, freshDB, "fresh install")
	if containsColumnName(freshCols, "available_chapters") {
		t.Fatalf("fresh install must never have available_chapters, got columns: %v", freshCols)
	}
	if !containsColumnName(freshCols, "available_episodes") {
		t.Fatalf("fresh install missing available_episodes, got columns: %v", freshCols)
	}
}

// TestSeasonsClosureJSONAdditiveMigration proves the P3 closure column is added
// by the probe-and-apply path on an install whose seasons table predates it: an
// existing row stays SQL NULL (no default), a second run is a no-op, and a
// fresh install carries the column from CreateDDL.
func TestSeasonsClosureJSONAdditiveMigration(t *testing.T) {
	db := openMigrationTestDB(t, "bridge.db")
	mustExec(t, db, "create legacy seasons", legacySeasonsDDL)
	mustExec(t, db, "seed legacy closed season", `INSERT INTO seasons
		(id, name, status, closed_at, created_at) VALUES ('legacy-1', 'Abril 2026', 'closed', 1234, 1)`)

	ensureSeasonSchema(t, db, "first run")
	cols := mustSeasonsColumns(t, db, "after first run")
	if !containsColumnName(cols, "closure_json") {
		t.Fatalf("closure_json missing after migration, got columns: %v", cols)
	}
	assertClosureRawNull(t, db, "legacy-1")

	// A second run must be a no-op: no error, no duplicate column.
	ensureSeasonSchema(t, db, "second run")
	cols = mustSeasonsColumns(t, db, "after second run")
	if n := countColumnName(cols, "closure_json"); n != 1 {
		t.Fatalf("closure_json must appear exactly once, got %d in %v", n, cols)
	}

	// A fresh install must have the column from CreateDDL alone.
	freshDB := openMigrationTestDB(t, "fresh.db")
	ensureSeasonSchema(t, freshDB, "fresh install")
	freshCols := mustSeasonsColumns(t, freshDB, "fresh install")
	if !containsColumnName(freshCols, "closure_json") {
		t.Fatalf("fresh install missing closure_json, got columns: %v", freshCols)
	}
}

// openMigrationTestDB opens a temp-dir SQLite database wired for single-conn
// test use and closed on cleanup.
func openMigrationTestDB(t *testing.T, name string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), name))
	if err != nil {
		t.Fatalf("open sqlite %s: %v", name, err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// mustExec runs one DDL/DML statement, failing the test with desc on error.
func mustExec(t *testing.T, db *sql.DB, desc, query string) {
	t.Helper()
	if _, err := db.Exec(query); err != nil {
		t.Fatalf("%s: %v", desc, err)
	}
}

// ensureSeasonSchema applies the full season schema (CreateDDL + migrations),
// failing the test with stage context on error.
func ensureSeasonSchema(t *testing.T, db *sql.DB, stage string) {
	t.Helper()
	for _, tbl := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, tbl); err != nil {
			t.Fatalf("EnsureTableSchema %s (%s): %v", tbl.Name, stage, err)
		}
	}
}

// mustSeasonAnimesColumns returns season_animes's live column names, failing
// the test with stage context on error.
func mustSeasonAnimesColumns(t *testing.T, db *sql.DB, stage string) []string {
	t.Helper()
	cols, err := tableColumns(db, "season_animes")
	if err != nil {
		t.Fatalf("inspect season_animes columns (%s): %v", stage, err)
	}
	return cols
}

// mustSeasonsColumns returns seasons's live column names, failing the test with
// stage context on error.
func mustSeasonsColumns(t *testing.T, db *sql.DB, stage string) []string {
	t.Helper()
	cols, err := tableColumns(db, "seasons")
	if err != nil {
		t.Fatalf("inspect seasons columns (%s): %v", stage, err)
	}
	return cols
}

// assertAvailableEpisodes asserts the persisted available_episodes value for
// one row, proving the seeded count survived the rename.
func assertAvailableEpisodes(t *testing.T, db *sql.DB, id string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRow(`SELECT available_episodes FROM season_animes WHERE id = ?`, id).Scan(&got); err != nil {
		t.Fatalf("select available_episodes: %v", err)
	}
	if got != want {
		t.Fatalf("available_episodes = %d, want %d (value must survive the rename)", got, want)
	}
}

// tableColumns returns table's live column names via PRAGMA table_info, for
// direct assertions independent of the Go store layer. table is always a
// package-level constant, so interpolating it carries no injection risk.
func tableColumns(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var cols []string
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var defaultVal sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, name)
	}
	return cols, rows.Err()
}

// containsColumnName reports whether target appears in cols.
func containsColumnName(cols []string, target string) bool {
	return countColumnName(cols, target) > 0
}

// countColumnName counts how many times target appears in cols.
func countColumnName(cols []string, target string) int {
	n := 0
	for _, c := range cols {
		if c == target {
			n++
		}
	}
	return n
}
