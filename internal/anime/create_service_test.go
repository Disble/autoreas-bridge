package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestCreateServiceUsesAuthoritativeMetadataAndReturnsCurrentToken(t *testing.T) {
	const modifiedAt = int64(1_700_000_000_456)
	total, duration := 24, 23
	provider := &stubCreateMetadataProvider{metadata: anime.CreateMetadata{
		AnnouncedTotal:  &total,
		DurationMinutes: &duration,
		CoverURL:        "https://cdn.example.test/canonical.jpg",
	}}
	store, write := configuredCreateWriteService(t, "metadata-anime", modifiedAt)
	service := anime.NewCreateService(write, provider)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Metadata Anime", Pagina: "https://example.test/metadata", Dias: []api.Placement{{Day: "Sin ver", Order: 2}},
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

	snapshot, err := store.GetSnapshot(context.Background(), "metadata-anime")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	fields := decodeCreatePayload(t, snapshot.CanonicalJSON)
	assertCreateJSONField(t, fields, "totalEpisodes", `24`)
	assertCreateJSONField(t, fields, "durationMinutes", `23`)
	assertCreateJSONField(t, fields, "cover", `{"type":"url","path":"https://cdn.example.test/canonical.jpg"}`)
}

func TestCreateServiceKeepsUnknownMetadataNullAndNeverUsesLatestEpisodeAsTotal(t *testing.T) {
	latest := 13
	provider := &stubCreateMetadataProvider{metadata: anime.CreateMetadata{LatestEpisode: &latest}}
	store, write := configuredCreateWriteService(t, "unknown-metadata", 1_700_000_000_789)
	service := anime.NewCreateService(write, provider)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Still Airing", Pagina: "https://example.test/still-airing", Dias: []api.Placement{{Day: "Sin ver", Order: 1}},
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if result.AnimeID == "" || result.ModifiedAt == 0 {
		t.Fatalf("result = %+v, want authoritative id and token", result)
	}

	snapshot, err := store.GetSnapshot(context.Background(), result.AnimeID)
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	fields := decodeCreatePayload(t, snapshot.CanonicalJSON)
	assertCreateJSONField(t, fields, "totalEpisodes", `null`)
	assertCreateJSONField(t, fields, "durationMinutes", `null`)
	assertCreateJSONField(t, fields, "cover", `{"type":"url","path":""}`)
}

func TestCreateServiceReturnsMetadataSourceFailureWithoutAppend(t *testing.T) {
	sourceErr := errors.New("metadata source unavailable")
	provider := &stubCreateMetadataProvider{err: sourceErr}
	writer := &stubAnimeWriter{}
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, writer)
	write.SetIDGen(func() string { return "source-failure" })
	service := anime.NewCreateService(write, provider)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Source Failure", Pagina: "https://example.test/source-failure", Dias: []api.Placement{{Day: "Sin ver", Order: 1}},
	})
	if !errors.Is(err, sourceErr) {
		t.Fatalf("CreateAnime error = %v, want metadata source error", err)
	}
	if result != (anime.PatchResult{}) {
		t.Fatalf("result = %+v, want zero result", result)
	}
	assertNoPendingAnimeChanged(t, store)
}

// TestCreateServiceReturnsGatewayFailureWithoutSuccessResult was removed by
// the SDD-55 cold cut: it exercised a Legacy append failure surfacing as a
// gateway error, but persist() no longer calls the (now unwired) append port
// at all -- see gateway_write_helpers.go's `g.config.Append != nil` guard.

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

// configuredCreateWriteService builds the store and write service used by create-service tests.
func configuredCreateWriteService(t *testing.T, id string, modifiedAt int64) (*bridgeSync.AnimeSnapshotStore, *anime.WriteService) {
	t.Helper()
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return id })
	write.SetNow(func() time.Time { return time.UnixMilli(modifiedAt).UTC() })
	return store, write
}

// decodeCreatePayload decodes a create payload into raw fields.
func decodeCreatePayload(t *testing.T, payload []byte) map[string]json.RawMessage {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal create payload: %v", err)
	}
	return fields
}

// assertCreateJSONField verifies one field in a create payload.
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
