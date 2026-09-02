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

// openTestSeasonDB opens a temp sqlite DB and applies the season schema directly
// via the schema registry, so the store is tested without depending on the sync
// bootstrap (and without an import cycle).
func openTestSeasonDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	for _, tbl := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, tbl); err != nil {
			t.Fatalf("ensure schema %s: %v", tbl.Name, err)
		}
	}
	return db
}

func TestSQLiteStoreCreateAndActiveSeason(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason("season-1", "Julio 2026", now)
	if err := store.CreateSeason(ctx, s); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}

	got, err := store.ActiveSeason(ctx)
	if err != nil {
		t.Fatalf("ActiveSeason: %v", err)
	}
	if got == nil {
		t.Fatal("ActiveSeason returned nil for an open season")
	}
	if got.ID != "season-1" || got.Name != "Julio 2026" {
		t.Fatalf("identity mismatch: %+v", got)
	}
	if got.MinApprovalGrade != 4 || got.Slots != 12 || got.Status != domain.StatusOpen {
		t.Fatalf("defaults mismatch: %+v", got)
	}
	if !got.CreatedAt.Equal(now) {
		t.Fatalf("CreatedAt = %v, want %v", got.CreatedAt, now)
	}
	if got.ClosedAt != nil || got.AppliedAt != nil || got.SelectionConfirmedAt != nil {
		t.Fatalf("milestones must be nil: %+v", got)
	}
}

func TestSQLiteStoreListSeasonsAndSeasonByID(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	t1 := time.UnixMilli(1_600_000_000_000)
	t2 := time.UnixMilli(1_700_000_000_000)
	old := domain.NewSeason("season-old", "Abril 2026", t1)
	if err := store.CreateSeason(ctx, old); err != nil {
		t.Fatalf("CreateSeason old: %v", err)
	}
	if err := old.Close(t2); err != nil { // free the single-open slot before the next
		t.Fatalf("close old: %v", err)
	}
	if err := store.UpdateSeason(ctx, old); err != nil {
		t.Fatalf("UpdateSeason old: %v", err)
	}
	newer := domain.NewSeason("season-new", "Julio 2026", t2)
	if err := store.CreateSeason(ctx, newer); err != nil {
		t.Fatalf("CreateSeason new: %v", err)
	}

	all, err := store.ListSeasons(ctx)
	if err != nil {
		t.Fatalf("ListSeasons: %v", err)
	}
	if len(all) != 2 || all[0].ID != "season-new" || all[1].ID != "season-old" {
		t.Fatalf("ListSeasons = %+v, want newest-first [season-new, season-old]", all)
	}

	got, err := store.SeasonByID(ctx, "season-old")
	if err != nil {
		t.Fatalf("SeasonByID: %v", err)
	}
	if got == nil || !got.IsClosed() {
		t.Fatalf("SeasonByID(season-old) = %+v, want a closed season", got)
	}

	missing, err := store.SeasonByID(ctx, "nope")
	if err != nil {
		t.Fatalf("SeasonByID(missing): %v", err)
	}
	if missing != nil {
		t.Fatalf("SeasonByID(missing) = %+v, want nil", missing)
	}
}

func TestSQLiteStoreActiveSeasonNilWhenNoneOpen(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	got, err := store.ActiveSeason(ctx)
	if err != nil {
		t.Fatalf("ActiveSeason on empty: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil active season, got %+v", got)
	}
}

func TestSQLiteStoreUpdateSeasonPersistsMilestonesAndClose(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason("season-1", "Julio 2026", now)
	if err := store.CreateSeason(ctx, s); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}

	if err := s.SetMinApprovalGrade(5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := s.SetSlots(9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	closedAt := now.Add(time.Hour)
	if err := s.Close(closedAt); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := store.UpdateSeason(ctx, s); err != nil {
		t.Fatalf("UpdateSeason: %v", err)
	}

	// The now-closed season is no longer the active one.
	active, err := store.ActiveSeason(ctx)
	if err != nil {
		t.Fatalf("ActiveSeason after close: %v", err)
	}
	if active != nil {
		t.Fatalf("expected no active season after close, got %+v", active)
	}
}

func TestSQLiteStoreSeasonAnimeGradeRoundTrip(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	if err := store.CreateSeason(ctx, domain.NewSeason("season-1", "Julio 2026", now)); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	sa := domain.NewSeasonAnime("sa-1", "season-1", "Anime A", now)
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-a"
	if err := store.CreateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("CreateSeasonAnime: %v", err)
	}

	// A fresh row is ungraded on disk.
	fresh, _ := store.SeasonAnimeByID(ctx, "sa-1")
	if fresh.IsGraded() || fresh.GradeSource != "" || fresh.RatedAt != nil || fresh.SkipGrading {
		t.Fatalf("fresh row must be ungraded on disk: %+v", fresh)
	}

	// Grade it and persist.
	rated := time.UnixMilli(1_700_000_500_000)
	fresh.ApplyGrade(5, domain.GradeSourceManual, rated)
	if err := store.UpdateSeasonAnime(ctx, *fresh); err != nil {
		t.Fatalf("UpdateSeasonAnime: %v", err)
	}

	reread, err := store.SeasonAnimeByID(ctx, "sa-1")
	if err != nil || reread == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, reread)
	}
	if reread.Grade != 5 || reread.GradeSource != domain.GradeSourceManual {
		t.Fatalf("grade not persisted: %+v", reread)
	}
	if reread.RatedAt == nil || !reread.RatedAt.Equal(rated) {
		t.Fatalf("RatedAt not persisted: %+v", reread.RatedAt)
	}

	// Skip persists too.
	reread.Skip()
	reread.Grade = 0
	reread.GradeSource = ""
	reread.RatedAt = nil
	if err := store.UpdateSeasonAnime(ctx, *reread); err != nil {
		t.Fatalf("UpdateSeasonAnime skip: %v", err)
	}
	afterSkip, _ := store.SeasonAnimeByID(ctx, "sa-1")
	if !afterSkip.SkipGrading || afterSkip.IsGraded() {
		t.Fatalf("skip not persisted: %+v", afterSkip)
	}
}

func TestSQLiteStoreSeasonAnimeRoundTrip(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	if err := store.CreateSeason(ctx, domain.NewSeason("season-1", "Julio 2026", now)); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}

	sa := domain.NewSeasonAnime("sa-1", "season-1", "Dr. Stone: Science Future Part 3", now)
	if err := store.CreateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("CreateSeasonAnime: %v", err)
	}

	list, err := store.ListSeasonAnimes(ctx, "season-1")
	if err != nil {
		t.Fatalf("ListSeasonAnimes: %v", err)
	}
	if len(list) != 1 || list[0].RawName != "Dr. Stone: Science Future Part 3" {
		t.Fatalf("unexpected list: %+v", list)
	}
	if list[0].MatchStatus != domain.MatchPending || list[0].Availability != domain.AvailabilityWaiting {
		t.Fatalf("defaults mismatch: %+v", list[0])
	}

	// Resolve to matched with ranked candidates persisted as JSON.
	got := list[0]
	got.MatchStatus = domain.MatchMatched
	got.MatchedSlug = "https://jkanime.net/dr-stone-science-future-part-3/"
	got.Candidates = []domain.MatchCandidate{
		{Title: "Dr. Stone: Science Future Part 3", PageURL: "https://jkanime.net/dr-stone-science-future-part-3/", Score: 1.0},
		{Title: "Dr. Stone: Science Future Part 2", PageURL: "https://jkanime.net/dr-stone-science-future-part-2/", Score: 0.9},
	}
	if err := store.UpdateSeasonAnime(ctx, got); err != nil {
		t.Fatalf("UpdateSeasonAnime: %v", err)
	}

	reread, err := store.SeasonAnimeByID(ctx, "sa-1")
	if err != nil || reread == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, reread)
	}
	if reread.MatchStatus != domain.MatchMatched || reread.MatchedSlug == "" {
		t.Fatalf("match not persisted: %+v", reread)
	}
	if len(reread.Candidates) != 2 || reread.Candidates[0].Score != 1.0 {
		t.Fatalf("candidates JSON not round-tripped: %+v", reread.Candidates)
	}
}

func TestSQLiteStoreSeasonAnimeByIDMissing(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	got, err := store.SeasonAnimeByID(context.Background(), "nope")
	if err != nil {
		t.Fatalf("SeasonAnimeByID missing: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for missing row, got %+v", got)
	}
}

func TestSQLiteStoreSingleOpenSeasonInvariant(t *testing.T) {
	db := openTestSeasonDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	now := time.UnixMilli(1_700_000_000_000)
	if err := store.CreateSeason(ctx, domain.NewSeason("season-1", "Julio 2026", now)); err != nil {
		t.Fatalf("first CreateSeason: %v", err)
	}
	if err := store.CreateSeason(ctx, domain.NewSeason("season-2", "Octubre 2026", now)); err == nil {
		t.Fatal("creating a second open season must violate the single-open invariant")
	}
}
