package desktop

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// TestStartupWiresWatchRecorderIntoMobileWriteService asserts App wires
// watchRecorderAdapter into activityAnimeWriteService (the mobile write
// path) end to end, which also proves the adapter delegates to the store.
func TestStartupWiresWatchRecorderIntoMobileWriteService(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":1,"status":0,"active":true}`, 1000)

	app := newAppTestApp(t)
	app.bridgeDB = db
	app.animeQuery = anime.NewQueryService(store)
	app.animeWrite = anime.NewWriteService(store, &stubAppUpdateWriter{})

	progress := 2.0
	base := int64(1000)
	if _, err := app.newMobileAnimeWriteService().PatchAnime(ctx, "anime-1", contracts.AnimePatch{NroCapVisto: &progress, Base: &base}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	page, err := watchhistory.NewStore(db).Page(ctx, watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("page watch history: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Episode != 2 {
		t.Fatalf("expected the mobile write path to record episode 2, got %#v", page.Items)
	}
}
