package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

func TestHandleAnimeWatchedAcceptsOnlySuccessfulMutationOutcomes(t *testing.T) {
	tests := []struct {
		name         string
		outcome      AnimeMutationOutcome
		wantErr      bool
		wantConflict bool
	}{
		{name: "applied", outcome: AnimeMutationApplied},
		{name: "no op", outcome: AnimeMutationNoOp},
		{name: "conflict", outcome: AnimeMutationConflict, wantErr: true, wantConflict: true},
		{name: "unknown", outcome: AnimeMutationOutcome("unexpected"), wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repo := newFakeRepo()
			service := newTestService(repo)
			gateway := &fakeGateway{moveResult: AnimeMutationResult{
				AnimeID: "anime-a", Outcome: test.outcome, ModifiedAt: 2000, ConflictID: "conflict-21",
			}}
			service.SetAvailabilityDeps(&fakeProbe{}, gateway)
			ctx := context.Background()
			active, _ := service.CreateSeason(ctx, "Julio 2026")
			row := domain.NewSeasonAnime("sa-1", active.ID, "Anime A", service.now())
			row.Availability = domain.AvailabilityCreated
			row.AnimeID = "anime-a"
			_ = repo.CreateSeasonAnime(ctx, row)

			err := service.HandleAnimeWatched(ctx, "anime-a", "Ver hoy", 1)
			if test.wantErr {
				if err == nil {
					t.Fatal("HandleAnimeWatched error = nil, want failure")
				}
				if test.wantConflict && !errors.Is(err, ErrAnimeMutationConflict) {
					t.Fatalf("HandleAnimeWatched error = %v, want conflict", err)
				}
			} else if err != nil {
				t.Fatalf("HandleAnimeWatched error = %v, want nil", err)
			}
		})
	}
}

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

	_, err := service.CreateSeasonAnimes(ctx, []string{"sa-1"}, "", nil)
	if !errors.Is(err, ErrAnimeMutationConflict) {
		t.Fatalf("CreateSeasonAnimes error = %v, want conflict", err)
	}
	stored, _ := repo.SeasonAnimeByID(ctx, "sa-1")
	if stored.Availability != domain.AvailabilityAvailable || stored.AnimeID != "" {
		t.Fatalf("conflicting create mutated season row: %#v", stored)
	}
}
