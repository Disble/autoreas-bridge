package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

func TestCreateSeasonAnimesConflictDoesNotMarkRowCreated(t *testing.T) {
	repo := newFakeRepo()
	service := newTestService(repo)
	gateway := &fakeGateway{createResult: AnimeMutationResult{
		AnimeID: "anime-current", Outcome: AnimeMutationConflict, ModifiedAt: 2000, ConflictID: "conflict-22",
	}}
	service.SetAvailabilityDeps(&fakeProbe{}, gateway)
	ctx := context.Background()
	active, _ := service.CreateSeason(ctx, "Julio 2026")
	row := domain.NewSeasonAnime("sa-1", active.ID, "Anime A", service.now())
	row.MatchStatus = domain.MatchMatched
	row.MatchedSlug = "https://jkanime.net/a/"
	row.Availability = domain.AvailabilityAvailable
	_ = repo.CreateSeasonAnime(ctx, row)

	_, err := service.CreateSeasonAnimes(ctx, []string{"sa-1"}, "", nil, nil)
	if !errors.Is(err, ErrAnimeMutationConflict) {
		t.Fatalf("CreateSeasonAnimes error = %v, want conflict", err)
	}
	stored, _ := repo.SeasonAnimeByID(ctx, "sa-1")
	if stored.Availability != domain.AvailabilityAvailable || stored.AnimeID != "" {
		t.Fatalf("conflicting create mutated season row: %#v", stored)
	}
}
