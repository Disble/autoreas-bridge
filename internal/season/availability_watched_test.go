package season

import (
	"context"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

func TestHandleAnimeWatchedMovesVerHoyToVisto(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	sa := domain.NewSeasonAnime("sa-1", season.ID, "Anime A", svc.now())
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-a"
	_ = repo.CreateSeasonAnime(ctx, sa)

	if err := svc.HandleAnimeWatched(ctx, "anime-a", "Ver hoy", 1); err != nil {
		t.Fatalf("HandleAnimeWatched: %v", err)
	}
	if gateway.moved["anime-a"] != "Visto" {
		t.Fatalf("expected move to Visto, got %q", gateway.moved["anime-a"])
	}
}

func TestHandleAnimeWatchedIgnoresNonVerHoyAndUnwatched(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	sa := domain.NewSeasonAnime("sa-1", season.ID, "Anime A", svc.now())
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-a"
	_ = repo.CreateSeasonAnime(ctx, sa)

	_ = svc.HandleAnimeWatched(ctx, "anime-a", "Sin ver", 3)
	_ = svc.HandleAnimeWatched(ctx, "anime-a", "Ver hoy", 0)
	_ = svc.HandleAnimeWatched(ctx, "other", "Ver hoy", 5)

	if len(gateway.moved) != 0 {
		t.Fatalf("expected no moves, got %+v", gateway.moved)
	}
}
