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
	seedAnimeSnapshot(t, store, "anime-older", `{"_id":"anime-older","nombre":"Older Watch","nrocapvisto":5,"estado":1,"fechaUltCapVisto":{"$$date":1700000001000}}`)
	seedAnimeSnapshot(t, store, "anime-newer", `{"_id":"anime-newer","nombre":"Newer Watch","nrocapvisto":10,"estado":2,"tipo":1,"fechaCreacion":{"$$date":1500000000000},"fechaUltCapVisto":{"$$date":1700000002000}}`)
	seedAnimeSnapshot(t, store, "anime-never-watched", `{"_id":"anime-never-watched","nombre":"Never Watched","nrocapvisto":0}`)

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeHistory(ctx)
	if err != nil {
		t.Fatalf("list anime history: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 history entries (never-watched excluded), got %d: %#v", len(got), got)
	}

	newer := got[0]
	if newer.ID != "anime-newer" || newer.Nombre != "Newer Watch" || newer.NroCapVisto != 10 || newer.Estado != 2 || newer.FechaUltCapVisto != 1700000002000 {
		t.Fatalf("expected newer entry first with full projection, got %#v", newer)
	}
	if newer.Tipo == nil || *newer.Tipo != 1 {
		t.Fatalf("expected newer entry tipo 1 when present in source, got %#v", newer.Tipo)
	}
	if newer.FechaCreacion == nil || *newer.FechaCreacion != 1500000000000 {
		t.Fatalf("expected newer entry fechaCreacion 1500000000000 when present in source, got %#v", newer.FechaCreacion)
	}

	older := got[1]
	if older.ID != "anime-older" || older.Nombre != "Older Watch" || older.NroCapVisto != 5 || older.Estado != 1 || older.FechaUltCapVisto != 1700000001000 {
		t.Fatalf("expected older entry second with full projection, got %#v", older)
	}
	if older.Tipo != nil {
		t.Fatalf("expected older entry tipo nil when absent from source, got %#v", older.Tipo)
	}
	if older.FechaCreacion != nil {
		t.Fatalf("expected older entry fechaCreacion nil when absent from source, got %#v", older.FechaCreacion)
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
	seedAnimeSnapshot(t, store, "anime-deleted", `{"_id":"anime-deleted","nombre":"Soft Deleted","nrocapvisto":3,"estado":1,"activo":false,"fechaEliminacion":{"$$date":1700000003000},"fechaUltCapVisto":{"$$date":1700000000500}}`)

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeHistory(ctx)
	if err != nil {
		t.Fatalf("list anime history: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected soft-deleted anime with watch activity to stay visible, got %d: %#v", len(got), got)
	}
	if got[0].ID != "anime-deleted" || got[0].Estado != 1 {
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
