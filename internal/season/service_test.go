package season

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// fakeRepo is an in-memory Repository for service unit tests.
type fakeRepo struct {
	seasons     map[string]domain.Season
	order       []string
	animes      map[string]domain.SeasonAnime
	animesOrder []string
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{seasons: map[string]domain.Season{}, animes: map[string]domain.SeasonAnime{}}
}

func (r *fakeRepo) CreateSeasonAnime(_ context.Context, sa domain.SeasonAnime) error {
	r.animes[sa.ID] = sa
	r.animesOrder = append(r.animesOrder, sa.ID)
	return nil
}

func (r *fakeRepo) ListSeasonAnimes(_ context.Context, seasonID string) ([]domain.SeasonAnime, error) {
	var out []domain.SeasonAnime
	for _, id := range r.animesOrder {
		if sa := r.animes[id]; sa.SeasonID == seasonID {
			out = append(out, sa)
		}
	}
	return out, nil
}

func (r *fakeRepo) SeasonAnimeByID(_ context.Context, id string) (*domain.SeasonAnime, error) {
	sa, ok := r.animes[id]
	if !ok {
		return nil, nil
	}
	cp := sa
	return &cp, nil
}

func (r *fakeRepo) UpdateSeasonAnime(_ context.Context, sa domain.SeasonAnime) error {
	if _, ok := r.animes[sa.ID]; !ok {
		return errors.New("season anime not found")
	}
	r.animes[sa.ID] = sa
	return nil
}

func (r *fakeRepo) CreateSeason(_ context.Context, s domain.Season) error {
	if _, ok := r.seasons[s.ID]; ok {
		return errors.New("duplicate id")
	}
	r.seasons[s.ID] = s
	r.order = append(r.order, s.ID)
	return nil
}

func (r *fakeRepo) ActiveSeason(_ context.Context) (*domain.Season, error) {
	for _, id := range r.order {
		s := r.seasons[id]
		if s.Status == domain.StatusOpen {
			cp := s
			return &cp, nil
		}
	}
	return nil, nil
}

func (r *fakeRepo) UpdateSeason(_ context.Context, s domain.Season) error {
	if _, ok := r.seasons[s.ID]; !ok {
		return errors.New("not found")
	}
	r.seasons[s.ID] = s
	return nil
}

// fakeSearcher is an in-memory NameSearcher keyed by exact query.
type fakeSearcher struct {
	byQuery map[string][]match.Candidate
	err     error
}

func (f *fakeSearcher) Search(_ context.Context, query string) ([]match.Candidate, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.byQuery[query], nil
}

func newTestService(repo Repository) *Service {
	return newTestServiceWithSearcher(repo, &fakeSearcher{byQuery: map[string][]match.Candidate{}})
}

func newTestServiceWithSearcher(repo Repository, searcher NameSearcher) *Service {
	fixed := time.UnixMilli(1_700_000_000_000)
	n := 0
	return NewService(repo, func() time.Time { return fixed }, func() string {
		n++
		return "id-" + string(rune('0'+n))
	}, searcher)
}

func TestServiceCreateSeason(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	s, err := svc.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if s.Name != "Julio 2026" || s.Status != domain.StatusOpen || s.Slots != 12 || s.MinApprovalGrade != 4 {
		t.Fatalf("unexpected season: %+v", s)
	}

	active, err := svc.ActiveSeason(ctx)
	if err != nil || active == nil || active.ID != s.ID {
		t.Fatalf("ActiveSeason = %+v, err %v", active, err)
	}
}

func TestServiceCreateSeasonRejectsSecondOpen(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("first CreateSeason: %v", err)
	}
	_, err := svc.CreateSeason(ctx, "Octubre 2026")
	if !errors.Is(err, ErrSeasonAlreadyOpen) {
		t.Fatalf("expected ErrSeasonAlreadyOpen, got %v", err)
	}
}

func TestServiceSetParametersAndClose(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	created, _ := svc.CreateSeason(ctx, "Julio 2026")

	if err := svc.SetMinApprovalGrade(ctx, 5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := svc.SetSlots(ctx, 9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.MinApprovalGrade != 5 || active.Slots != 9 {
		t.Fatalf("params not persisted: %+v", active)
	}

	if err := svc.CloseSeason(ctx); err != nil {
		t.Fatalf("CloseSeason: %v", err)
	}
	if after, _ := svc.ActiveSeason(ctx); after != nil {
		t.Fatalf("expected no active season after close, got %+v", after)
	}

	stored := repo.seasons[created.ID]
	if !stored.IsClosed() || stored.ClosedAt == nil {
		t.Fatalf("closed season not persisted: %+v", stored)
	}
}

func TestServiceMutationsRequireActiveSeason(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()

	if err := svc.SetSlots(ctx, 10); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
	if err := svc.CloseSeason(ctx); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
}

func TestServiceSetInvalidParameterRejected(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()
	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if err := svc.SetMinApprovalGrade(ctx, 9); err == nil {
		t.Fatal("grade 9 must be rejected")
	}
}

func TestServiceImportIntakeParsesDedupesAndSkipsBlanks(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	count, err := svc.ImportIntake(ctx, season.ID, "  Dr. Stone  \n\nMARRIAGETOXIN\ndr. stone\n   \nAkane-banashi\n")
	if err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 unique names imported, got %d", count)
	}
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}
	for _, r := range rows {
		if r.MatchStatus != domain.MatchPending {
			t.Fatalf("imported rows must be pending, got %q", r.MatchStatus)
		}
	}
}

func TestServiceRunMatchingClassifiesRows(t *testing.T) {
	repo := newFakeRepo()
	searcher := &fakeSearcher{byQuery: map[string][]match.Candidate{
		"Dr. Stone: Science Future Part 3": {
			{Title: "Dr. Stone: Science Future Part 3", PageURL: "https://jkanime.net/dr-stone-science-future-part-3/"},
			{Title: "Dr. Stone: Science Future Part 2", PageURL: "https://jkanime.net/dr-stone-science-future-part-2/"},
		},
		"Sword Art": {
			{Title: "Sword Art Online", PageURL: "https://jkanime.net/sword-art-online/"},
			{Title: "Sword Art Offline", PageURL: "https://jkanime.net/sword-art-offline/"},
		},
		"Anime Inexistente": {},
	}}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Dr. Stone: Science Future Part 3\nSword Art\nAnime Inexistente")

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byName := map[string]domain.SeasonAnime{}
	for _, r := range rows {
		byName[r.RawName] = r
	}

	if got := byName["Dr. Stone: Science Future Part 3"]; got.MatchStatus != domain.MatchMatched || got.MatchedSlug == "" {
		t.Fatalf("Dr. Stone should be matched, got %+v", got)
	}
	if got := byName["Sword Art"]; got.MatchStatus != domain.MatchAmbiguous || len(got.Candidates) < 2 {
		t.Fatalf("Sword Art should be ambiguous with candidates, got %+v", got)
	}
	if got := byName["Anime Inexistente"]; got.MatchStatus != domain.MatchNotFound {
		t.Fatalf("Anime Inexistente should be not_found, got %+v", got)
	}
}

func TestServiceResolveMatchSetsMatchedSlug(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Some Anime")
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)

	if err := svc.ResolveMatch(ctx, rows[0].ID, "https://jkanime.net/some-anime/"); err != nil {
		t.Fatalf("ResolveMatch: %v", err)
	}
	got, _ := repo.SeasonAnimeByID(ctx, rows[0].ID)
	if got.MatchStatus != domain.MatchMatched || got.MatchedSlug != "https://jkanime.net/some-anime/" {
		t.Fatalf("resolve did not set matched slug: %+v", got)
	}
}

func TestServiceDiscardName(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Some Anime")
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)

	if err := svc.DiscardName(ctx, rows[0].ID); err != nil {
		t.Fatalf("DiscardName: %v", err)
	}
	got, _ := repo.SeasonAnimeByID(ctx, rows[0].ID)
	if got.MatchStatus != domain.MatchDiscarded {
		t.Fatalf("discard did not set status: %+v", got)
	}
}
