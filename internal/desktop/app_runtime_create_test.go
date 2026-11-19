package desktop

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestCreateAnimeReturnsTheBatchErrorWithoutAResult pins a rejected batch as the binding's
// error under its message, never an "error" outcome.
func TestCreateAnimeReturnsTheBatchErrorWithoutAResult(t *testing.T) {
	app := readyAnimeApp(editorServices(bridgeSync.NewAnimeSnapshotStore(openRuntimeBridgeDB(t))))
	got, err := app.CreateAnime(AnimeCreateCommandDTO{})
	assertAnimeFailure(t, "CreateAnime", got, err, apperr.CodeInternal, "create anime batch: at least one anime create is required")
}

// TestCreateAnimeMapsCommandAndDelegatesToCreateBatch covers tasks.md 5.1:
// App.CreateAnime maps the wire DTO to contracts.AnimeCreate/CreateBatch and
// returns the mapped AnimeCreateResult.
func TestCreateAnimeMapsCommandAndDelegatesToCreateBatch(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	write := anime.NewWriteService(store, &stubAppCommittedPublisher{})
	write.SetIDGen(func() string { return "created-anime" })
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })
	app := readyAnimeApp(animeServices{createBatch: anime.NewCreateService(write)})

	got, err := app.CreateAnime(AnimeCreateCommandDTO{
		Creates: []AnimeCreateItemDTO{
			{Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Dias: []AnimeCreatePlacementDTO{{Day: "Sin ver", Order: 1}}},
		},
	})
	if err != nil || got.Outcome != contracts.AnimePatchOutcomeApplied {
		t.Fatalf("unexpected create result: %#v, %v", got, err)
	}
	if len(got.AnimeIDs) != 1 || got.AnimeIDs[0] != "created-anime" {
		t.Fatalf("animeIDs = %v, want [created-anime]", got.AnimeIDs)
	}

	snapshot, err := store.GetSnapshot(context.Background(), "created-anime")
	if err != nil || len(snapshot.CanonicalJSON) == 0 {
		t.Fatalf("expected the created anime to be persisted: %v, %#v", err, snapshot)
	}
}
