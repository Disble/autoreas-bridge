package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
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
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}
	if writer.animeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", writer.animeID)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
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
}

func TestWriteServicePatchAnimeForcesEstadoFinalizado(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":11,"estado":2,"totalcap":12}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000456).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(12), Base: int64Ptr(0)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.EstadoValue() == nil || *raw.EstadoValue() != 1 {
		t.Fatalf("expected forced estado 1, got %#v", raw.EstadoValue())
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
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	stampedAt := raw.FechaUltCapVisto.Time()
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

	err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(3), Base: int64Ptr(0)})
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

	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(1000)}); err != nil {
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

	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(0)}); err != nil {
		t.Fatalf("first patch anime: %v", err)
	}
	if len(writer.payloads) != 1 {
		t.Fatalf("expected 1 payload after first write, got %d", len(writer.payloads))
	}
	updateAnimeSnapshot(t, store, "anime-1", writer.payloads[0])

	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{Dias: []string{"Martes", "Miercoles"}, Base: int64Ptr(0)}); err != nil {
		t.Fatalf("second patch anime: %v", err)
	}
	if len(writer.payloads) != 2 {
		t.Fatalf("expected 2 payloads after second write, got %d", len(writer.payloads))
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payloads[1], &raw); err != nil {
		t.Fatalf("unmarshal second writer payload: %v", err)
	}
	if raw.NroCapVisto != 5 {
		t.Fatalf("expected second write to preserve nrocapvisto 5, got %v", raw.NroCapVisto)
	}
	wantDias := []string{"Martes", "Miercoles"}
	if !reflect.DeepEqual(raw.DiasStrings(), wantDias) {
		t.Fatalf("expected dias %#v, got %#v", wantDias, raw.DiasStrings())
	}
}
