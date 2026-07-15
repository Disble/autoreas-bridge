package anime_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestWriteServicePatchAnimePublishesMergedSnapshotWithFractionalProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":2,"estado":2,"totalcap":26,"activo":true,"pagina":"netflix"}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(10.5), Base: int64Ptr(0)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}
	if writer.animeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", writer.animeID)
	}

	value := decodeAnimeDomain(t, writer.payload)
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
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":11,"estado":2,"totalcap":12}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000456).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(12), Base: int64Ptr(0)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	value := decodeAnimeDomain(t, writer.payload)
	if value.Status == nil || *value.Status != 1 {
		t.Fatalf("expected forced state 1, got %#v", value.Status)
	}
}

func TestWriteServicePatchAnimeUsesClientFechaUltCapVistoWhenProvided(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000999).UTC() })

	clientTs := int64(1710000000123)
	patch := api.AnimePatch{NroCapVisto: floatPtr(664), FechaUltCapVisto: &clientTs, Base: int64Ptr(0)}
	if _, err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	value := decodeAnimeDomain(t, writer.payload)
	stampedAt := value.LastWatchedAt
	if stampedAt == nil || stampedAt.UnixMilli() != clientTs {
		t.Fatalf("expected client fechaUltCapVisto %d, got %v", clientTs, stampedAt)
	}
}

func TestWriteServicePatchAnimeReturnsWriterError(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2}`)

	wantErr := errors.New("append failed")
	writer := &stubAnimeWriter{err: wantErr}
	service := anime.NewWriteService(store, writer)

	_, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(3), Base: int64Ptr(0)})
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected writer error %v, got %v", wantErr, err)
	}
}

func TestWriteServicePatchAnimeStampsModifiedAtOnConfirmedSnapshot(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

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

func TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12,"dias":[{"dia":"Lunes","orden":1}]}`)

	writer := &capturingAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(0)}); err != nil {
		t.Fatalf("first patch anime: %v", err)
	}
	if len(writer.payloads) != 1 {
		t.Fatalf("expected 1 payload after first write, got %d", len(writer.payloads))
	}
	updateAnimeSnapshot(t, store, "anime-1", writer.payloads[0])

	if _, err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{Dias: []string{"Martes", "Miercoles"}, Base: int64Ptr(0)}); err != nil {
		t.Fatalf("second patch anime: %v", err)
	}
	if len(writer.payloads) != 2 {
		t.Fatalf("expected 2 payloads after second write, got %d", len(writer.payloads))
	}

	value := decodeAnimeDomain(t, writer.payloads[1])
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
