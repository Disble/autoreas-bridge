package season

import (
	"context"
	"errors"
	"slices"
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

// newFakeRepo creates an in-memory season repository for tests.
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

func (r *fakeRepo) ListSeasons(_ context.Context) ([]domain.Season, error) {
	out := make([]domain.Season, 0, len(r.order))
	for _, v := range slices.Backward(r.order) {
		out = append(out, r.seasons[v])
	}
	return out, nil
}

func (r *fakeRepo) SeasonByID(_ context.Context, id string) (*domain.Season, error) {
	s, ok := r.seasons[id]
	if !ok {
		return nil, nil
	}
	cp := s
	return &cp, nil
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

// newTestService creates a service with the default test dependencies.
func newTestService(repo Repository) *Service {
	return newTestServiceWithSearcher(repo, &fakeSearcher{byQuery: map[string][]match.Candidate{}})
}

// newTestServiceWithSearcher creates a service with a supplied name searcher.
func newTestServiceWithSearcher(repo Repository, searcher NameSearcher) *Service {
	fixed := time.UnixMilli(1_700_000_000_000)
	n := 0
	return NewService(repo, func() time.Time { return fixed }, func() string {
		n++
		return "id-" + string(rune('0'+n))
	}, searcher)
}
