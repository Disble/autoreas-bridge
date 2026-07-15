package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestCreateServiceUsesAuthoritativeMetadataAndReturnsCurrentToken(t *testing.T) {
	const modifiedAt = int64(1_700_000_000_456)
	total, duration := 24, 23
	provider := &stubCreateMetadataProvider{metadata: anime.CreateMetadata{
		AnnouncedTotal:  &total,
		DurationMinutes: &duration,
		CoverURL:        "https://cdn.example.test/canonical.jpg",
	}}
	write, writer := configuredCreateWriteService(t, "metadata-anime", modifiedAt)
	service := anime.NewCreateService(write, provider)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Metadata Anime", Pagina: "https://example.test/metadata", Section: "Sin ver", Orden: 2,
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if result.AnimeID != "metadata-anime" || result.ModifiedAt != modifiedAt {
		t.Fatalf("result = %+v, want id metadata-anime and modified_at %d", result, modifiedAt)
	}
	if provider.calls != 1 || provider.sourceURL != "https://example.test/metadata" {
		t.Fatalf("metadata lookup = calls %d source %q", provider.calls, provider.sourceURL)
	}

	fields := decodeCreatePayload(t, writer.payload)
	assertCreateJSONField(t, fields, "totalcap", `24`)
	assertCreateJSONField(t, fields, "duracion", `23`)
	assertCreateJSONField(t, fields, "portada", `{"type":"url","path":"https://cdn.example.test/canonical.jpg"}`)
}

func TestCreateServiceKeepsUnknownMetadataNullAndNeverUsesLatestEpisodeAsTotal(t *testing.T) {
	latest := 13
	provider := &stubCreateMetadataProvider{metadata: anime.CreateMetadata{LatestEpisode: &latest}}
	write, writer := configuredCreateWriteService(t, "unknown-metadata", 1_700_000_000_789)
	service := anime.NewCreateService(write, provider)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Still Airing", Pagina: "https://example.test/still-airing", Section: "Sin ver", Orden: 1,
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if result.AnimeID == "" || result.ModifiedAt == 0 {
		t.Fatalf("result = %+v, want authoritative id and token", result)
	}

	fields := decodeCreatePayload(t, writer.payload)
	assertCreateJSONField(t, fields, "totalcap", `null`)
	assertCreateJSONField(t, fields, "duracion", `null`)
	assertCreateJSONField(t, fields, "portada", `{"type":"url","path":""}`)
}

func TestCreateServiceReturnsMetadataSourceFailureWithoutOwnershipOrAppend(t *testing.T) {
	sourceErr := errors.New("metadata source unavailable")
	provider := &stubCreateMetadataProvider{err: sourceErr}
	writer := &stubAnimeWriter{}
	registry := &stubOwnershipRegistry{}
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, writer)
	write.SetIDGen(func() string { return "source-failure" })
	write.SetDeps(anime.WriteServiceDeps{Ownership: registry})
	service := anime.NewCreateService(write, provider)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Source Failure", Pagina: "https://example.test/source-failure", Section: "Sin ver", Orden: 1,
	})
	if !errors.Is(err, sourceErr) {
		t.Fatalf("CreateAnime error = %v, want metadata source error", err)
	}
	if result != (anime.AnimePatchResult{}) {
		t.Fatalf("result = %+v, want zero result", result)
	}
	if len(registry.registeredIDs()) != 0 || writer.calls != 0 {
		t.Fatalf("side effects before metadata success: registered=%v writes=%d", registry.registeredIDs(), writer.calls)
	}
	assertNoPendingAnimeChanged(t, store)
}

func TestCreateServiceReturnsGatewayFailureWithoutSuccessResult(t *testing.T) {
	persistErr := errors.New("Legacy append unavailable")
	writer := &stubAnimeWriter{err: persistErr}
	registry := &stubOwnershipRegistry{}
	write := anime.NewWriteService(openAnimeServiceTestStore(t), writer)
	write.SetIDGen(func() string { return "persist-failure" })
	write.SetDeps(anime.WriteServiceDeps{Ownership: registry})
	service := anime.NewCreateService(write, nil)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Persist Failure", Pagina: "https://example.test/persist-failure", Section: "Sin ver", Orden: 1,
	})
	if !errors.Is(err, persistErr) {
		t.Fatalf("CreateAnime error = %v, want persistence error", err)
	}
	if result != (anime.AnimePatchResult{}) {
		t.Fatalf("result = %+v, want zero result", result)
	}
	if got := registry.registeredIDs(); len(got) != 1 || got[0] != "persist-failure" {
		t.Fatalf("register-first ownership = %v, want [persist-failure]", got)
	}
	if writer.calls != 1 {
		t.Fatalf("Legacy append attempts = %d, want one failed attempt", writer.calls)
	}
}

type stubCreateMetadataProvider struct {
	metadata  anime.CreateMetadata
	err       error
	calls     int
	sourceURL string
}

func (s *stubCreateMetadataProvider) Lookup(_ context.Context, sourceURL string) (anime.CreateMetadata, error) {
	s.calls++
	s.sourceURL = sourceURL
	return s.metadata, s.err
}

func configuredCreateWriteService(t *testing.T, id string, modifiedAt int64) (*anime.WriteService, *stubAnimeWriter) {
	t.Helper()
	writer := &stubAnimeWriter{}
	write := anime.NewWriteService(openAnimeServiceTestStore(t), writer)
	write.SetIDGen(func() string { return id })
	write.SetNow(func() time.Time { return time.UnixMilli(modifiedAt).UTC() })
	write.SetDeps(anime.WriteServiceDeps{Ownership: &stubOwnershipRegistry{}})
	return write, writer
}

func decodeCreatePayload(t *testing.T, payload []byte) map[string]json.RawMessage {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal create payload: %v", err)
	}
	return fields
}

func assertCreateJSONField(t *testing.T, fields map[string]json.RawMessage, key, want string) {
	t.Helper()
	got, ok := fields[key]
	if !ok {
		t.Fatalf("missing create field %q in %v", key, fields)
	}
	if string(got) != want {
		t.Fatalf("create field %q = %s, want %s", key, got, want)
	}
}
