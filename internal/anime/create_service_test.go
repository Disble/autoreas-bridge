package anime_test

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestCreateServicePersistsUnsupportedDownloadPageWithoutLookup(t *testing.T) {
	store, write := configuredCreateWriteService(t, "unsupported-page", 1_700_000_000_456)
	service := anime.NewCreateService(write)

	result, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: "Reference Anime", Pagina: "https://pixeldrain.net/l/qyupHs6T", Dias: []api.Placement{{Day: "Sin ver", Order: 1}},
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if result.AnimeID != "unsupported-page" {
		t.Fatalf("result = %+v, want persisted unsupported-page", result)
	}
	if _, err := store.GetSnapshot(context.Background(), "unsupported-page"); err != nil {
		t.Fatalf("unsupported page was not persisted: %v", err)
	}
}

// TestCreateServiceReturnsGatewayFailureWithoutSuccessResult was removed by
// the SDD-55 cold cut: it exercised a Legacy append failure surfacing as a
// gateway error, but persist() no longer calls the (now unwired) append port
// at all -- see gateway_write_helpers.go's `g.config.Append != nil` guard.

// configuredCreateWriteService builds the store and write service used by create-service tests.
func configuredCreateWriteService(t *testing.T, id string, modifiedAt int64) (*bridgeSync.AnimeSnapshotStore, *anime.WriteService) {
	t.Helper()
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return id })
	write.SetNow(func() time.Time { return time.UnixMilli(modifiedAt).UTC() })
	return store, write
}
