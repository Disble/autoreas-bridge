package anime_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestWriteServicePatchAnimePublishesMergedSnapshotWithFractionalProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Cowboy Bebop","episodesWatched":2,"status":2,"totalEpisodes":26,"active":true,"sourceUrl":"netflix"}`)

	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(10.5), Base: int64Ptr(0)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.AnimeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", got.AnimeID)
	}

	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Title != "Cowboy Bebop" {
		t.Fatalf("expected title to be preserved, got %q", value.Title)
	}
	if value.Progress != 10.5 {
		t.Fatalf("expected progress 10.5, got %v", value.Progress)
	}
	if value.Status == nil || *value.Status != 2 {
		t.Fatalf("expected state 2 to be preserved, got %#v", value.Status)
	}
	stampedAt := value.LastWatchedAt
	if stampedAt == nil || stampedAt.UnixMilli() != 1710000000123 {
		t.Fatalf("expected stamped timestamp 1710000000123, got %v", stampedAt)
	}
}

func TestWriteServicePatchAnimeForcesEstadoFinalizado(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":11,"status":2,"totalEpisodes":12}`)

	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000456).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(12), Base: int64Ptr(0)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, got.CanonicalJSON)
	if value.Status == nil || *value.Status != 1 {
		t.Fatalf("expected forced state 1, got %#v", value.Status)
	}
}

func TestWriteServicePatchAnimeUsesClientFechaUltCapVistoWhenProvided(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"One Piece","episodesWatched":661,"status":2,"totalEpisodes":1200,"active":true}`)

	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000999).UTC() })

	clientTs := int64(1710000000123)
	patch := api.AnimePatch{NroCapVisto: floatPtr(664), FechaUltCapVisto: &clientTs, Base: int64Ptr(0)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, got.CanonicalJSON)
	stampedAt := value.LastWatchedAt
	if stampedAt == nil || stampedAt.UnixMilli() != clientTs {
		t.Fatalf("expected client fechaUltCapVisto %d, got %v", clientTs, stampedAt)
	}
}

func TestWriteServicePatchAnimeStampsModifiedAtOnConfirmedSnapshot(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(1000)}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 1000 {
		t.Fatalf("expected confirmed snapshot ModifiedAt to advance past previous 1000, got %d", got.ModifiedAt)
	}
}

// TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites
// proves each PatchAnime call reads its base state from the just-finalized
// SQLite snapshot, not from stale in-memory state. SDD-55 Slice B: persist()
// finalizes straight into anime_snapshots (ADR-55-1), so the second patch's
// base merge is observed directly from store.GetSnapshot -- no manual replay
// of a writer-captured payload is needed anymore.
func TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":2,"status":2,"totalEpisodes":12,"days":[{"day":"Lunes","order":1}]}`)

	service := anime.NewWriteService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(0)}); err != nil {
		t.Fatalf("first patch anime: %v", err)
	}
	afterFirst, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot after first write: %v", err)
	}

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{Dias: []string{"Martes", "Miercoles"}, Base: int64Ptr(afterFirst.ModifiedAt)}); err != nil {
		t.Fatalf("second patch anime: %v", err)
	}
	afterSecond, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot after second write: %v", err)
	}
	if afterSecond.ModifiedAt == afterFirst.ModifiedAt {
		t.Fatalf("expected second write to advance ModifiedAt past %d", afterFirst.ModifiedAt)
	}

	value := decodeAnimeDomain(t, afterSecond.CanonicalJSON)
	if value.Progress != 5 {
		t.Fatalf("expected second write to preserve progress 5, got %v", value.Progress)
	}
	wantDias := []string{"Martes", "Miercoles"}
	gotDays := make([]string, 0, len(value.Days))
	for _, day := range value.Days {
		gotDays = append(gotDays, day.Day)
	}
	if !reflect.DeepEqual(gotDays, wantDias) {
		t.Fatalf("expected days %#v, got %#v", wantDias, gotDays)
	}
}
