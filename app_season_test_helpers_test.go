package main

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

type appliedDaysChapterService struct {
	*stubAppChapterService
}

func (s *appliedDaysChapterService) SetAnimeDays(_ context.Context, cmd anime.SetAnimeDaysCommand) (anime.ChapterCommandResult, error) {
	s.lastDays = cmd
	return anime.ChapterCommandResult{AnimeID: cmd.AnimeID, Outcome: anime.PatchOutcomeApplied}, s.err
}

// fakeSeasonRepo is an in-memory season.Repository for binding tests.
type fakeSeasonRepo struct {
	seasons     map[string]domain.Season
	order       []string
	createErr   error
	animes      map[string]domain.SeasonAnime
	animesOrder []string
}

// newFakeSeasonRepo creates an in-memory season repository for tests.
func newFakeSeasonRepo() *fakeSeasonRepo {
	return &fakeSeasonRepo{seasons: map[string]domain.Season{}}
}

func (r *fakeSeasonRepo) CreateSeason(_ context.Context, seasonValue domain.Season) error {
	if r.createErr != nil {
		return r.createErr
	}
	r.seasons[seasonValue.ID] = seasonValue
	r.order = append(r.order, seasonValue.ID)
	return nil
}

func (r *fakeSeasonRepo) ActiveSeason(_ context.Context) (*domain.Season, error) {
	for _, id := range r.order {
		if seasonValue := r.seasons[id]; seasonValue.Status == domain.StatusOpen {
			copy := seasonValue
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *fakeSeasonRepo) UpdateSeason(_ context.Context, seasonValue domain.Season) error {
	r.seasons[seasonValue.ID] = seasonValue
	return nil
}

func (r *fakeSeasonRepo) ListSeasons(_ context.Context) ([]domain.Season, error) {
	out := make([]domain.Season, 0, len(r.order))
	for index := len(r.order) - 1; index >= 0; index-- {
		out = append(out, r.seasons[r.order[index]])
	}
	return out, nil
}

func (r *fakeSeasonRepo) SeasonByID(_ context.Context, id string) (*domain.Season, error) {
	seasonValue, ok := r.seasons[id]
	if !ok {
		return nil, nil
	}
	copy := seasonValue
	return &copy, nil
}

func (r *fakeSeasonRepo) CreateSeasonAnime(_ context.Context, seasonAnime domain.SeasonAnime) error {
	if r.animes == nil {
		r.animes = map[string]domain.SeasonAnime{}
	}
	r.animes[seasonAnime.ID] = seasonAnime
	r.animesOrder = append(r.animesOrder, seasonAnime.ID)
	return nil
}

func (r *fakeSeasonRepo) ListSeasonAnimes(_ context.Context, seasonID string) ([]domain.SeasonAnime, error) {
	var out []domain.SeasonAnime
	for _, id := range r.animesOrder {
		if seasonAnime := r.animes[id]; seasonAnime.SeasonID == seasonID {
			out = append(out, seasonAnime)
		}
	}
	return out, nil
}

func (r *fakeSeasonRepo) SeasonAnimeByID(_ context.Context, id string) (*domain.SeasonAnime, error) {
	seasonAnime, ok := r.animes[id]
	if !ok {
		return nil, nil
	}
	copy := seasonAnime
	return &copy, nil
}

func (r *fakeSeasonRepo) UpdateSeasonAnime(_ context.Context, seasonAnime domain.SeasonAnime) error {
	r.animes[seasonAnime.ID] = seasonAnime
	return nil
}

// newTestSeasonApp creates an application backed by a test season service.
func newTestSeasonApp(repo season.Repository, hub *stubAppRealtimeHub) *App {
	fixed := time.UnixMilli(1_700_000_000_000)
	nextID := 0
	service := season.NewService(repo, func() time.Time { return fixed }, func() string {
		nextID++
		return fmt.Sprintf("id-%d", nextID)
	}, nil)
	app := &App{ctx: context.Background(), seasonService: service}
	if hub != nil {
		app.realtimeHub = hub
	}
	return app
}

type fakeAppNameSearcher struct {
	byQuery map[string][]match.Candidate
}

func (f fakeAppNameSearcher) Search(_ context.Context, query string) ([]match.Candidate, error) {
	return f.byQuery[query], nil
}

type fakeAppAvailabilityProbe struct {
	chapters map[string]int
}

func (f fakeAppAvailabilityProbe) AvailableChapters(_ context.Context, pageURL string) (int, error) {
	return f.chapters[pageURL], nil
}
