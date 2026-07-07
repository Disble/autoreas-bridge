package season

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

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

func TestSeasonAnimesAdditiveMigrationOnExistingInstall(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })

	// Simulate an existing install: the pre-SDD-44 table already exists.
	if _, err := db.Exec(`CREATE TABLE seasons (
		id TEXT PRIMARY KEY, name TEXT NOT NULL, min_approval_grade INTEGER NOT NULL DEFAULT 4,
		slots INTEGER NOT NULL DEFAULT 12, status TEXT NOT NULL DEFAULT 'open',
		selection_confirmed_at INTEGER, applied_at INTEGER, closed_at INTEGER, created_at INTEGER NOT NULL)`); err != nil {
		t.Fatalf("create legacy seasons: %v", err)
	}
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
