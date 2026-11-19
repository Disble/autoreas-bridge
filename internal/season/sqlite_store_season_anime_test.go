package season

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// TestSQLiteStoreSeasonAnimeRowsRoundTripAndSurviveReopen writes one row per
// stored concern into one season -- a match with ranked candidates, a grade then a
// skip, a search_failed status and confirmed metadata -- and reads each back from
// every read path and from a NEW store opened over the same file, which is the
// "reopen the app" claim.
func TestSQLiteStoreSeasonAnimeRowsRoundTripAndSurviveReopen(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db := openTestSeasonDBAt(t, dbPath)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	now := time.UnixMilli(1_700_000_000_000)

	if err := store.CreateSeason(ctx, domain.NewSeason("season-1", "Julio 2026", now)); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	missing, err := store.SeasonAnimeByID(ctx, "nope")
	if err != nil {
		t.Fatalf("SeasonAnimeByID missing: %v", err)
	}
	if missing != nil {
		t.Fatalf("expected nil for missing row, got %+v", missing)
	}

	assertMatchRoundTrips(t, store, now)
	assertGradeAndSkipRoundTrip(t, store, now)

	if err := store.CreateSeasonAnime(ctx, domain.NewSeasonAnime("sa-failed", "season-1", "Typo Anime", now)); err != nil {
		t.Fatalf("CreateSeasonAnime: %v", err)
	}
	if err := store.CreateSeasonAnime(ctx, domain.NewSeasonAnime("sa-meta", "season-1", "Frieren", now)); err != nil {
		t.Fatalf("CreateSeasonAnime: %v", err)
	}
	assertSeasonAnimeMetadataRawNull(t, db, "sa-meta")

	// The run marks the row search_failed through the update path, as the live
	// run does when a name search fails.
	const confirmed = `{"kind":0,"totalEpisodes":24,"genres":["Action"]}`
	updateSeasonAnime(t, store, "sa-failed", func(row *domain.SeasonAnime) { row.MatchStatus = domain.MatchSearchFailed })
	updateSeasonAnime(t, store, "sa-meta", func(row *domain.SeasonAnime) { row.MetadataJSON = confirmed })

	listed, err := store.ListSeasonAnimes(ctx, "season-1")
	if err != nil || len(listed) != 4 {
		t.Fatalf("ListSeasonAnimes = %+v (%v), want 4 rows", listed, err)
	}
	reopened := NewSQLiteStore(openTestSeasonDBAt(t, dbPath))
	for _, read := range []map[string]domain.SeasonAnime{seasonAnimesByID(listed), readSeasonAnimes(t, store), readSeasonAnimes(t, reopened)} {
		if read["sa-failed"].MatchStatus != domain.MatchSearchFailed {
			t.Fatalf("status = %+v, want %q on every read path and after the reopen", read["sa-failed"], domain.MatchSearchFailed)
		}
		if read["sa-meta"].MetadataJSON != confirmed {
			t.Fatalf("metadata = %q, want %q on every read path and after the reopen", read["sa-meta"].MetadataJSON, confirmed)
		}
	}
}

// assertMatchRoundTrips creates sa-1, checks its listed defaults, then persists
// a match with ranked candidates and reads it back.
func assertMatchRoundTrips(t *testing.T, store *SQLiteStore, now time.Time) {
	t.Helper()
	ctx := context.Background()

	if err := store.CreateSeasonAnime(ctx, domain.NewSeasonAnime("sa-1", "season-1", "Dr. Stone: Science Future Part 3", now)); err != nil {
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

// assertGradeAndSkipRoundTrip creates the created row sa-graded, checks it is
// ungraded on disk, persists a manual grade, then a skip.
func assertGradeAndSkipRoundTrip(t *testing.T, store *SQLiteStore, now time.Time) {
	t.Helper()
	ctx := context.Background()

	sa := domain.NewSeasonAnime("sa-graded", "season-1", "Anime A", now)
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-a"
	if err := store.CreateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("CreateSeasonAnime: %v", err)
	}
	fresh, _ := store.SeasonAnimeByID(ctx, "sa-graded")
	if fresh.IsGraded() || fresh.GradeSource != "" || fresh.RatedAt != nil || fresh.SkipGrading {
		t.Fatalf("fresh row must be ungraded on disk: %+v", fresh)
	}

	rated := time.UnixMilli(1_700_000_500_000)
	fresh.ApplyGrade(5, domain.GradeSourceManual, rated)
	if err := store.UpdateSeasonAnime(ctx, *fresh); err != nil {
		t.Fatalf("UpdateSeasonAnime: %v", err)
	}
	reread, err := store.SeasonAnimeByID(ctx, "sa-graded")
	if err != nil || reread == nil {
		t.Fatalf("SeasonAnimeByID: %v (%+v)", err, reread)
	}
	if reread.Grade != 5 || reread.GradeSource != domain.GradeSourceManual {
		t.Fatalf("grade not persisted: %+v", reread)
	}
	if reread.RatedAt == nil || !reread.RatedAt.Equal(rated) {
		t.Fatalf("RatedAt not persisted: %+v", reread.RatedAt)
	}

	reread.Skip()
	reread.Grade = 0
	reread.GradeSource = ""
	reread.RatedAt = nil
	if err := store.UpdateSeasonAnime(ctx, *reread); err != nil {
		t.Fatalf("UpdateSeasonAnime skip: %v", err)
	}
	afterSkip, _ := store.SeasonAnimeByID(ctx, "sa-graded")
	if !afterSkip.SkipGrading || afterSkip.IsGraded() {
		t.Fatalf("skip not persisted: %+v", afterSkip)
	}
}

// updateSeasonAnime reads one row, applies change and writes it back.
func updateSeasonAnime(t *testing.T, store *SQLiteStore, id string, change func(*domain.SeasonAnime)) {
	t.Helper()

	row, err := store.SeasonAnimeByID(context.Background(), id)
	if err != nil || row == nil {
		t.Fatalf("SeasonAnimeByID(%s): %v (%+v)", id, err, row)
	}
	change(row)
	if err := store.UpdateSeasonAnime(context.Background(), *row); err != nil {
		t.Fatalf("UpdateSeasonAnime(%s): %v", id, err)
	}
}

// readSeasonAnimes reads the search_failed and metadata rows through SeasonAnimeByID.
func readSeasonAnimes(t *testing.T, store *SQLiteStore) map[string]domain.SeasonAnime {
	t.Helper()

	read := map[string]domain.SeasonAnime{}
	for _, id := range []string{"sa-failed", "sa-meta"} {
		row, err := store.SeasonAnimeByID(context.Background(), id)
		if err != nil || row == nil {
			t.Fatalf("SeasonAnimeByID(%s): %v (%+v)", id, err, row)
		}
		read[id] = *row
	}
	return read
}

// seasonAnimesByID indexes listed rows by their ID.
func seasonAnimesByID(rows []domain.SeasonAnime) map[string]domain.SeasonAnime {
	byID := make(map[string]domain.SeasonAnime, len(rows))
	for _, row := range rows {
		byID[row.ID] = row
	}
	return byID
}
