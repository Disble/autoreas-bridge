package anime_test

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestQueryServiceListAnimeHistoryOrdersByRecencyAndExcludesAnimesWithoutWatchActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-older", `{"id":"anime-older","name":"Older Watch","episodesWatched":5,"status":1,"lastWatchedAt":1700000001000}`)
	seedAnimeSnapshot(t, store, "anime-newer", `{"id":"anime-newer","name":"Newer Watch","episodesWatched":10,"status":2,"kind":1,"createdAt":1500000000000,"lastWatchedAt":1700000002000}`)
	seedAnimeSnapshot(t, store, "anime-never-watched", `{"id":"anime-never-watched","name":"Never Watched","episodesWatched":0}`)

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeHistory(ctx)
	if err != nil {
		t.Fatalf("list anime history: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 history entries (never-watched excluded), got %d: %#v", len(got), got)
	}

	newer := got[0]
	if newer.ID != "anime-newer" || newer.Name != "Newer Watch" || newer.EpisodesWatched != 10 || newer.Status != 2 || newer.LastWatchedAt != 1700000002000 {
		t.Fatalf("expected newer entry first with full projection, got %#v", newer)
	}
	if newer.Kind == nil || *newer.Kind != 1 {
		t.Fatalf("expected newer entry tipo 1 when present in source, got %#v", newer.Kind)
	}
	if newer.CreatedAt == nil || *newer.CreatedAt != 1500000000000 {
		t.Fatalf("expected newer entry fechaCreacion 1500000000000 when present in source, got %#v", newer.CreatedAt)
	}

	older := got[1]
	if older.ID != "anime-older" || older.Name != "Older Watch" || older.EpisodesWatched != 5 || older.Status != 1 || older.LastWatchedAt != 1700000001000 {
		t.Fatalf("expected older entry second with full projection, got %#v", older)
	}
	if older.Kind != nil {
		t.Fatalf("expected older entry tipo nil when absent from source, got %#v", older.Kind)
	}
	if older.CreatedAt != nil {
		t.Fatalf("expected older entry fechaCreacion nil when absent from source, got %#v", older.CreatedAt)
	}
}

// TestQueryServiceListAnimeHistoryKeepsInactiveAnimesVisible documents the
// verified soft-delete precedent (design.md Decision 1): ListAnimeItems does
// not filter on Activo/Estado at all (TestQueryServiceListAnimeItemsReturnsActiveAndInactive
// asserts both appear), so ListAnimeHistory mirrors that -- an
// inactive/soft-deleted anime with watch activity stays in the History
// activity log, matching Legacy's "Historial" screen which lists
// "Eliminar"-state animes too.
func TestQueryServiceListAnimeHistoryKeepsInactiveAnimesVisible(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-deleted", `{"id":"anime-deleted","name":"Soft Deleted","episodesWatched":3,"status":1,"active":false,"deletedAt":1700000003000,"lastWatchedAt":1700000000500}`)

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeHistory(ctx)
	if err != nil {
		t.Fatalf("list anime history: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected soft-deleted anime with watch activity to stay visible, got %d: %#v", len(got), got)
	}
	if got[0].ID != "anime-deleted" || got[0].Status != 1 {
		t.Fatalf("expected soft-deleted anime projection preserved, got %#v", got[0])
	}
}

func TestQueryServiceGetEffectiveAnimeReturnsNotFoundForZombie(t *testing.T) {
	service := anime.NewQueryService(openAnimeServiceTestStore(t))
	_, err := service.GetEffectiveAnime(context.Background(), "zombie-1")
	if !errors.Is(err, api.ErrAnimeNotFound) {
		t.Fatalf("expected ErrAnimeNotFound, got %v", err)
	}
}
