package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

// fakeProbe reports the count of available episodes per page URL.
type fakeProbe struct {
	episodes map[string]int
	err      error
}

func (f *fakeProbe) AvailableEpisodes(_ context.Context, pageURL string) (int, error) {
	if f.err != nil {
		return 0, f.err
	}
	return f.episodes[pageURL], nil
}

// fakeGateway records creates and answers existing-by-pagina lookups.
type fakeGateway struct {
	existingByPagina map[string]string
	created          []AnimeCreateInput
	nextID           int
	moved            map[string]string
	selections       map[string]selectionState
	placements       map[string][]domain.Placement
	scheduled        map[string][]domain.Placement
	failSchedule     map[string]bool
	createResult     AnimeMutationResult
	moveResult       AnimeMutationResult
	selectionResult  AnimeMutationResult
	scheduleResult   AnimeMutationResult
}

type selectionState struct {
	estado int
	activo bool
}

func (g *fakeGateway) CreateAnime(_ context.Context, in AnimeCreateInput) (AnimeMutationResult, error) {
	g.created = append(g.created, in)
	g.nextID++
	if g.createResult.Outcome != "" {
		return g.createResult, nil
	}
	return AnimeMutationResult{AnimeID: "created-anime", Outcome: AnimeMutationApplied}, nil
}

func (g *fakeGateway) FindActiveByPagina(_ context.Context, pageURL string) (string, bool, error) {
	id, ok := g.existingByPagina[pageURL]
	return id, ok, nil
}

func (g *fakeGateway) MoveToSection(_ context.Context, animeID, section string) (AnimeMutationResult, error) {
	if g.moved == nil {
		g.moved = map[string]string{}
	}
	g.moved[animeID] = section
	if g.moveResult.Outcome != "" {
		return g.moveResult, nil
	}
	return AnimeMutationResult{AnimeID: animeID, Outcome: AnimeMutationApplied}, nil
}

func (g *fakeGateway) SetSelection(_ context.Context, animeID string, estado int, activo bool) (AnimeMutationResult, error) {
	if g.selections == nil {
		g.selections = map[string]selectionState{}
	}
	g.selections[animeID] = selectionState{estado: estado, activo: activo}
	if g.selectionResult.Outcome != "" {
		return g.selectionResult, nil
	}
	return AnimeMutationResult{AnimeID: animeID, Outcome: AnimeMutationApplied}, nil
}

func (g *fakeGateway) CurrentPlacements(_ context.Context, animeIDs []string) (map[string][]domain.Placement, error) {
	out := map[string][]domain.Placement{}
	for _, id := range animeIDs {
		if p, ok := g.placements[id]; ok {
			out[id] = p
		}
	}
	return out, nil
}

func (g *fakeGateway) SetAnimeSchedule(_ context.Context, animeID string, dias []domain.Placement) (AnimeMutationResult, error) {
	if g.failSchedule[animeID] {
		return AnimeMutationResult{}, errors.New("write failed")
	}
	if g.scheduled == nil {
		g.scheduled = map[string][]domain.Placement{}
	}
	g.scheduled[animeID] = dias
	if g.scheduleResult.Outcome != "" {
		return g.scheduleResult, nil
	}
	return AnimeMutationResult{AnimeID: animeID, Outcome: AnimeMutationApplied}, nil
}

// seedMatched adds a matched availability row to the test repository.
func seedMatched(t *testing.T, svc *Service, repo *fakeRepo, seasonID, id, name, slug string) {
	t.Helper()
	sa := domain.NewSeasonAnime(id, seasonID, name, svc.now())
	sa.MatchStatus = domain.MatchMatched
	sa.MatchedSlug = slug
	if err := repo.CreateSeasonAnime(context.Background(), sa); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

// seedCreated adds a created availability row to the test repository.
func seedCreated(t *testing.T, svc *Service, repo *fakeRepo, seasonID, id, name, slug, animeID string, episodes int) {
	t.Helper()
	sa := domain.NewSeasonAnime(id, seasonID, name, svc.now())
	sa.MatchStatus = domain.MatchMatched
	sa.MatchedSlug = slug
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = animeID
	sa.AvailableEpisodes = episodes
	if err := repo.CreateSeasonAnime(context.Background(), sa); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

// findRow returns one season anime row from the test service.
func findRow(t *testing.T, svc *Service, seasonID, id string) domain.SeasonAnime {
	t.Helper()
	rows, err := svc.ListSeasonAnimes(context.Background(), seasonID)
	if err != nil {
		t.Fatalf("ListSeasonAnimes: %v", err)
	}
	for _, row := range rows {
		if row.ID == id {
			return row
		}
	}
	t.Fatalf("row %q not found", id)
	return domain.SeasonAnime{}
}

// gatewayPlacementsErr is a fakeGateway whose CurrentPlacements always errors,
// to assert the whole run tolerates a batched-lookup failure.
type gatewayPlacementsErr struct {
	fakeGateway
}

func (g *gatewayPlacementsErr) CurrentPlacements(_ context.Context, _ []string) (map[string][]domain.Placement, error) {
	return nil, errors.New("placements lookup failed")
}
