package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// queryFailSearcher fails Search for the queries in failQuery and answers the
// rest from byQuery, recording every call in order.
type queryFailSearcher struct {
	byQuery   map[string][]match.Candidate
	failQuery map[string]error
	calls     []string
}

func (f *queryFailSearcher) Search(_ context.Context, query string) ([]match.Candidate, error) {
	f.calls = append(f.calls, query)
	if err, fail := f.failQuery[query]; fail {
		return nil, err
	}
	return f.byQuery[query], nil
}

// listFailRepo fails ListSeasonAnimes while delegating everything else.
type listFailRepo struct {
	*fakeRepo
	err error
}

func (r *listFailRepo) ListSeasonAnimes(_ context.Context, _ string) ([]domain.SeasonAnime, error) {
	return nil, r.err
}

// updateFailRepo fails UpdateSeasonAnime while delegating everything else.
type updateFailRepo struct {
	*fakeRepo
	err error
}

func (r *updateFailRepo) UpdateSeasonAnime(_ context.Context, _ domain.SeasonAnime) error {
	return r.err
}

// rowsByName indexes rows by raw name for assertions.
func rowsByName(rows []domain.SeasonAnime) map[string]domain.SeasonAnime {
	byName := make(map[string]domain.SeasonAnime, len(rows))
	for _, r := range rows {
		byName[r.RawName] = r
	}
	return byName
}

func TestServiceRunMatchingSurvivesPerRowSearchFailure(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{
		byQuery: map[string][]match.Candidate{
			"Good Anime": {{Title: "Good Anime", PageURL: "https://jkanime.net/good-anime/"}},
		},
		failQuery: map[string]error{"Bad Typo Anime": errors.New("search 404")},
	}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Bad Typo Anime\nGood Anime")

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("a per-row search failure must not fail the run, got %v", err)
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byName := rowsByName(rows)
	if got := byName["Good Anime"]; got.MatchStatus != domain.MatchMatched {
		t.Fatalf("the row after the failure must still be matched, got %+v", got)
	}
	if got := byName["Bad Typo Anime"]; got.MatchStatus != domain.MatchSearchFailed {
		t.Fatalf("the failing row must be search_failed, got %+v", got)
	}
	if got := byName["Bad Typo Anime"]; got.MatchedSlug != "" || len(got.Candidates) != 0 {
		t.Fatalf("a search_failed row must clear slug and candidates, got %+v", got)
	}
}

// TestServiceRunMatchingClearsStaleResolutionOnFailure pins the invariant that
// a row never shows a resolution its failed search contradicts. The state is
// reachable rather than theoretical: a backup bundle carries match_status and
// matched_slug as opaque values, so a row can arrive pending while still
// holding a slug and a candidate list.
func TestServiceRunMatchingClearsStaleResolutionOnFailure(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{failQuery: map[string]error{"Stale Anime": errors.New("search 503")}}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Stale Anime")

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	rows[0].MatchedSlug = "https://jkanime.net/stale-anime/"
	rows[0].Candidates = []domain.MatchCandidate{
		{Title: "Stale Anime", PageURL: "https://jkanime.net/stale-anime/", Score: 0.9},
	}
	if err := repo.UpdateSeasonAnime(ctx, rows[0]); err != nil {
		t.Fatalf("setup: %v", err)
	}

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}

	rows, _ = svc.ListSeasonAnimes(ctx, season.ID)
	if rows[0].MatchStatus != domain.MatchSearchFailed {
		t.Fatalf("expected search_failed, got %q", rows[0].MatchStatus)
	}
	if rows[0].MatchedSlug != "" || len(rows[0].Candidates) != 0 {
		t.Fatalf("a failed search must clear the stale resolution, got %+v", rows[0])
	}
}

func TestServiceRunMatchingRetriesSearchFailedRows(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{
		byQuery:   map[string][]match.Candidate{},
		failQuery: map[string]error{"Flaky Anime": errors.New("search 500")},
	}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Flaky Anime")

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	if rows[0].MatchStatus != domain.MatchSearchFailed {
		t.Fatalf("first run should leave search_failed, got %q", rows[0].MatchStatus)
	}

	// The search recovers: the next run must attempt the row again and resolve it.
	delete(searcher.failQuery, "Flaky Anime")
	searcher.byQuery["Flaky Anime"] = []match.Candidate{{Title: "Flaky Anime", PageURL: "https://jkanime.net/flaky-anime/"}}
	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}
	rows, _ = svc.ListSeasonAnimes(ctx, season.ID)
	if rows[0].MatchStatus != domain.MatchMatched {
		t.Fatalf("a recovered search_failed row must move to matched, got %+v", rows[0])
	}
}

func TestServiceRunMatchingSkipsDecidedRows(t *testing.T) {
	repo := newFakeRepo()
	searcher := &queryFailSearcher{byQuery: map[string][]match.Candidate{}}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "A\nB\nC\nD")
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	rows[0].MatchStatus = domain.MatchMatched
	rows[1].MatchStatus = domain.MatchAmbiguous
	rows[2].MatchStatus = domain.MatchNotFound
	rows[3].MatchStatus = domain.MatchDiscarded
	for _, r := range rows {
		if err := repo.UpdateSeasonAnime(ctx, r); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}
	if len(searcher.calls) != 0 {
		t.Fatalf("decided rows must not be searched, got calls %v", searcher.calls)
	}
	rows, _ = svc.ListSeasonAnimes(ctx, season.ID)
	for _, r := range rows {
		if r.MatchStatus != domain.MatchMatched && r.MatchStatus != domain.MatchAmbiguous &&
			r.MatchStatus != domain.MatchNotFound && r.MatchStatus != domain.MatchDiscarded {
			t.Fatalf("a decided row must keep its status, got %+v", r)
		}
	}
}

func TestServiceRunMatchingListFailureStillErrors(t *testing.T) {
	repo := &listFailRepo{fakeRepo: newFakeRepo(), err: errors.New("db down")}
	svc := newTestServiceWithSearcher(repo, &queryFailSearcher{})
	if err := svc.RunMatching(context.Background(), "season-1"); err == nil {
		t.Fatal("a ListSeasonAnimes failure must still return an error")
	}
}

func TestServiceRunMatchingUpdateFailureStillErrors(t *testing.T) {
	inner := newFakeRepo()
	repo := &updateFailRepo{fakeRepo: inner, err: errors.New("db down")}
	svc := newTestServiceWithSearcher(repo, &queryFailSearcher{byQuery: map[string][]match.Candidate{}})
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	// CreateSeasonAnime delegates to the inner repo, so the row exists while
	// UpdateSeasonAnime always fails.
	if _, err := svc.ImportIntake(ctx, season.ID, "Some Anime"); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := svc.RunMatching(ctx, season.ID); err == nil {
		t.Fatal("an UpdateSeasonAnime failure must still return an error")
	}
}
