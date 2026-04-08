package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestQueryServiceGetEffectiveAnimeReturnsInactiveAnime(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":4,"totalcap":12,"activo":false}`)

	service := anime.NewQueryService(store)
	got, err := service.GetEffectiveAnime(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get effective anime: %v", err)
	}

	if got == nil {
		t.Fatal("expected effective anime, got nil")
	}

	if got.ID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", got.ID)
	}

	if got.TotalCap == nil || *got.TotalCap != 12 {
		t.Fatalf("expected totalcap 12, got %#v", got.TotalCap)
	}

	if got.Activo == nil || *got.Activo {
		t.Fatalf("expected activo false, got %#v", got.Activo)
	}

	if len(got.SnapshotJSON) == 0 {
		t.Fatal("expected raw snapshot json to be returned")
	}
}

func TestQueryServiceGetEffectiveAnimeReturnsNotFoundForZombie(t *testing.T) {
	service := anime.NewQueryService(openAnimeServiceTestStore(t))
	_, err := service.GetEffectiveAnime(context.Background(), "zombie-1")
	if !errors.Is(err, api.ErrAnimeNotFound) {
		t.Fatalf("expected ErrAnimeNotFound, got %v", err)
	}
}

func TestWriteServicePatchAnimePublishesMergedSnapshotWithFractionalProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":2,"estado":2,"totalcap":26,"activo":true,"pagina":"netflix"}`)

	bus := events.NewBus()
	published := make(chan events.AnimeUpdateRequestedEvent, 1)
	bus.Subscribe(events.EventNameAnimeUpdateRequested, func(event events.Event) {
		update, ok := event.(events.AnimeUpdateRequestedEvent)
		if ok {
			published <- update
		}
	})

	service := anime.NewWriteService(store, bus)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(10.5)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	select {
	case update := <-published:
		if update.AnimeID != "anime-1" {
			t.Fatalf("expected anime id %q, got %q", "anime-1", update.AnimeID)
		}

		var raw domain.LegacyAnimeRaw
		if err := json.Unmarshal(update.Payload, &raw); err != nil {
			t.Fatalf("unmarshal published payload: %v", err)
		}

		if raw.Nombre != "Cowboy Bebop" {
			t.Fatalf("expected nombre to be preserved, got %q", raw.Nombre)
		}

		if raw.NroCapVisto != 10.5 {
			t.Fatalf("expected nrocapvisto 10.5, got %v", raw.NroCapVisto)
		}

		if raw.EstadoValue() == nil || *raw.EstadoValue() != 2 {
			t.Fatalf("expected estado 2 to be preserved, got %#v", raw.EstadoValue())
		}

		stampedAt := raw.FechaUltCapVisto.Time()
		if stampedAt == nil || stampedAt.UnixMilli() != 1710000000123 {
			t.Fatalf("expected stamped timestamp 1710000000123, got %v", stampedAt)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected AnimeUpdateRequestedEvent to be published")
	}
}

func TestWriteServicePatchAnimeForcesEstadoFinalizado(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":11,"estado":2,"totalcap":12}`)

	bus := events.NewBus()
	published := make(chan events.AnimeUpdateRequestedEvent, 1)
	bus.Subscribe(events.EventNameAnimeUpdateRequested, func(event events.Event) {
		update, ok := event.(events.AnimeUpdateRequestedEvent)
		if ok {
			published <- update
		}
	})

	service := anime.NewWriteService(store, bus)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000456).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(12)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	select {
	case update := <-published:
		var raw domain.LegacyAnimeRaw
		if err := json.Unmarshal(update.Payload, &raw); err != nil {
			t.Fatalf("unmarshal published payload: %v", err)
		}

		if raw.EstadoValue() == nil || *raw.EstadoValue() != 1 {
			t.Fatalf("expected forced estado 1, got %#v", raw.EstadoValue())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected AnimeUpdateRequestedEvent to be published")
	}
}

func openAnimeServiceTestStore(t *testing.T) *bridgeSync.AnimeSnapshotStore {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return bridgeSync.NewAnimeSnapshotStore(db)
}

func seedAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()

	records := map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}

	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed anime snapshot: %v", err)
	}
}

func floatPtr(value float64) *float64 {
	return &value
}
