package desktop

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// libraryRootApp wires the real snapshot store, query, editor and settings
// over a fresh bridge database, seeded with three animes under `D:\Anime`
// (one active, one inactive) and one active anime on another drive.
func libraryRootApp(t *testing.T) (*App, *bridgeSync.AnimeSnapshotStore) {
	t.Helper()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	records := map[string]anime.SnapshotRecord{}
	for id, payload := range map[string]string{
		"y": `{"id":"y","name":"Yani Neko","active":true,"folder":"D:\\Anime\\Yani Neko\\OVA"}`,
		"h": `{"id":"h","name":"Overlord","active":false,"folder":"D:\\Anime\\Overlord"}`,
		"e": `{"id":"e","name":"Eureka","active":true,"folder":"E:\\Anime\\Eureka"}`,
	} {
		records[id] = anime.SnapshotRecord{AnimeID: id, CanonicalJSON: []byte(payload), Hash: id, ModifiedAt: 100}
	}
	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed animes: %v", err)
	}
	settingsStore := settings.NewSQLiteStore(db)
	if err := settingsStore.SetLibraryRoot(context.Background(), `D:\Anime`); err != nil {
		t.Fatalf("seed library root: %v", err)
	}
	app := withSettingsStore(&App{
		ctx:              context.Background(),
		animeQuery:       anime.NewQueryService(store),
		animeEditorWrite: anime.NewEditorService(store, &stubAppCommittedPublisher{}),
	}, settingsStore)
	return app, store
}

// storedFolder reads one anime's persisted folder.
func storedFolder(t *testing.T, store *bridgeSync.AnimeSnapshotStore, id string) string {
	t.Helper()
	record, err := store.GetSnapshot(context.Background(), id)
	if err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	var snapshot struct {
		Folder string `json:"folder"`
	}
	if err := json.Unmarshal(record.CanonicalJSON, &snapshot); err != nil {
		t.Fatalf("decode %s: %v", id, err)
	}
	return snapshot.Folder
}

func TestPreviewLibraryRootChangeListsTheActiveAnimesThatMove(t *testing.T) {
	app, _ := libraryRootApp(t)

	got, err := app.PreviewLibraryRootChange(`F:\Anime`)

	if err != nil || got.OldRoot != `D:\Anime` {
		t.Fatalf("want the stored old root and no failure, got %+v, %v", got, err)
	}
	if len(got.Moves) != 1 || got.Moves[0].AnimeID != "y" || got.Moves[0].To != `F:\Anime\Yani Neko\OVA` || got.Moves[0].BaseModifiedAt != 100 {
		t.Errorf("want only the active anime under the old root to move, got %+v", got.Moves)
	}
	if len(got.Kept) != 1 || got.Kept[0].AnimeID != "e" {
		t.Errorf("want the active anime on another drive kept, got %+v", got.Kept)
	}
}

func TestSetLibraryRootRebasesActiveFoldersBeforeSavingTheRoot(t *testing.T) {
	app, store := libraryRootApp(t)

	if err := app.SetLibraryRoot(`F:\Anime\`); err != nil {
		t.Fatalf("SetLibraryRoot: %v", err)
	}

	if root, err := app.GetLibraryRoot(); err != nil || root != `F:\Anime\` {
		t.Errorf("want the new root saved, got %q, %v", root, err)
	}
	for id, want := range map[string]string{"y": `F:\Anime\Yani Neko\OVA`, "h": `D:\Anime\Overlord`, "e": `E:\Anime\Eureka`} {
		if got := storedFolder(t, store, id); got != want {
			t.Errorf("anime %s: folder %q, want %q", id, got, want)
		}
	}

	nothingToMove := withSettingsStore(&App{}, app.settingsStore)
	if err := nothingToMove.SetLibraryRoot(`G:\Anime`); err != nil {
		t.Errorf("with nothing to move the root must save without an editor, got %v", err)
	}
}

func TestSetLibraryRootKeepsTheOldRootWhenAFolderCannotBeRebased(t *testing.T) {
	app, store := libraryRootApp(t)

	err := app.SetLibraryRoot(`\\NAS\Anime`)

	if status := fmt.Sprint(err); !strings.Contains(status, "updated 0 of 1") || !strings.Contains(status, "Yani Neko") || !strings.Contains(status, "not changed") {
		t.Fatalf("want a failure naming the anime and keeping the root, got %q", status)
	}
	if root, err := app.GetLibraryRoot(); err != nil || root != `D:\Anime` {
		t.Errorf("a failed rebase must keep the old root, got %q, %v", root, err)
	}
	if got := storedFolder(t, store, "y"); got != `D:\Anime\Yani Neko\OVA` {
		t.Errorf("a rejected folder must stay stored as it was, got %q", got)
	}
}
