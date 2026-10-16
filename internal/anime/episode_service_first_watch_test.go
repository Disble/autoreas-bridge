package anime_test

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestEpisodeServiceRepeatThenFirstWatchDerivesFreshPremiere pins repeat as the
// reset that re-arms the derivation: repeat clears the date, and the next
// zero-to-positive step derives a new one.
func TestEpisodeServiceRepeatThenFirstWatchDerivesFreshPremiere(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":5,"status":1,"active":true,"premieredAt":1600000000000}`, 1000)

	writer := &stubCommittedPublisher{}
	writeService := anime.NewWriteService(store, writer)
	freshWatch := int64(1710000000777)
	clock := int64(1710000000000)
	writeService.SetNow(func() time.Time { return time.UnixMilli(clock).UTC() })
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: writeService,
		Now:    func() time.Time { return time.UnixMilli(clock).UTC() },
	})

	if _, err := service.RepeatAnime(ctx, anime.RepeatAnimeCommand{AnimeID: "anime-1", Base: new(int64(1000))}); err != nil {
		t.Fatalf("repeat anime: %v", err)
	}
	assertPremieredAtMillis(t, ctx, store, nil)

	clock = freshWatch
	if _, err := service.AdjustWatchedEpisodes(ctx, anime.AdjustWatchedEpisodesCommand{AnimeID: "anime-1", Delta: 1}); err != nil {
		t.Fatalf("adjust after repeat: %v", err)
	}
	assertPremieredAtMillis(t, ctx, store, &freshWatch)
}

// assertPremieredAtMillis verifies the stored premiere instant, or that it is
// absent when wantMillis is nil.
func assertPremieredAtMillis(t *testing.T, ctx context.Context, store *bridgeSync.AnimeSnapshotStore, wantMillis *int64) {
	t.Helper()
	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if wantMillis == nil {
		if value.PremieredAt != nil {
			t.Fatalf("expected premieredAt cleared, got %v", value.PremieredAt)
		}
		return
	}
	if value.PremieredAt == nil || value.PremieredAt.UnixMilli() != *wantMillis {
		t.Fatalf("expected premieredAt %d, got %v", *wantMillis, value.PremieredAt)
	}
}
