package desktop

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestCreateAnimeReturnsExplicitOutcomeWhenServiceUnavailable(t *testing.T) {
	app := &App{}
	got := app.CreateAnime(AnimeCreateCommandDTO{})
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Message == "" {
		t.Fatalf("expected explicit error outcome when create batch service is unavailable, got %#v", got)
	}
}

// TestCreateAnimeMapsCommandAndDelegatesToCreateBatch covers tasks.md 5.1:
// App.CreateAnime maps the wire DTO to contracts.AnimeCreate/CreateBatch and
// returns the mapped AnimeCreateResult.
func TestCreateAnimeMapsCommandAndDelegatesToCreateBatch(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	write := anime.NewWriteService(store, &stubAppUpdateWriter{})
	write.SetIDGen(func() string { return "created-anime" })
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })
	service := anime.NewCreateService(write)
	app := &App{ctx: context.Background(), animeCreateBatch: service}

	got := app.CreateAnime(AnimeCreateCommandDTO{
		Creates: []AnimeCreateItemDTO{
			{Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Dias: []AnimeCreatePlacementDTO{{Day: "Sin ver", Order: 1}}},
		},
	})
	if got.Outcome != contracts.AnimePatchOutcomeApplied {
		t.Fatalf("unexpected create result: %#v", got)
	}
	if len(got.AnimeIDs) != 1 || got.AnimeIDs[0] != "created-anime" {
		t.Fatalf("animeIDs = %v, want [created-anime]", got.AnimeIDs)
	}

	snapshot, err := store.GetSnapshot(context.Background(), "created-anime")
	if err != nil || len(snapshot.CanonicalJSON) == 0 {
		t.Fatalf("expected the created anime to be persisted: %v, %#v", err, snapshot)
	}
}
