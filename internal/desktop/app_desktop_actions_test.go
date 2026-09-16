package desktop

import (
	"context"
	"encoding/json"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	sharedlogger "autoreas-bridge/internal/logger"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestOpenAnimePageOpensPageAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":0,"active":true,"sourceUrl":"https://anime.example/frieren"}`, 1000)

	var openedURL string
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := &App{
		ctx:          ctx,
		bridgeDB:     db,
		animeQuery:   anime.NewQueryService(store),
		sharedLogger: sharedlogger.NewFanoutLogger(memLogger),
		openURL: func(_ context.Context, url string) {
			openedURL = url
		},
	}

	got := app.OpenAnimePage("anime-1")

	if got.Status != "ok" {
		t.Fatalf("expected ok result, got %#v", got)
	}
	if openedURL != "https://anime.example/frieren" {
		t.Fatalf("expected page URL to be opened, got %q", openedURL)
	}
	assertDesktopActionEvent(t, memLogger, "anime.page_opened", "anime-1", "Frieren", got.CorrelationID)
}

func TestCopyAnimeFolderCopiesFolderAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":0,"active":true,"folder":"C:/Anime/Frieren"}`, 1000)

	var copiedText string
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := &App{
		ctx:          ctx,
		bridgeDB:     db,
		animeQuery:   anime.NewQueryService(store),
		sharedLogger: sharedlogger.NewFanoutLogger(memLogger),
		copyText: func(_ context.Context, value string) error {
			copiedText = value
			return nil
		},
	}

	got := app.CopyAnimeFolder("anime-1")

	if got.Status != "ok" {
		t.Fatalf("expected ok result, got %#v", got)
	}
	if copiedText != "C:/Anime/Frieren" {
		t.Fatalf("expected folder path to be copied, got %q", copiedText)
	}
	assertDesktopActionEvent(t, memLogger, "anime.folder_copied", "anime-1", "Frieren", got.CorrelationID)
}

// TestRecordDesktopAnimeActionDegradesSilentlyWithoutASharedLogger proves the
// D7 recording-failure coupling is gone: a nil sharedLogger (mirroring every
// other lazily wired App collaborator) does not panic and there is no error
// to report -- unlike the retired activity.Store path, Logf never fails.
func TestRecordDesktopAnimeActionDegradesSilentlyWithoutASharedLogger(t *testing.T) {
	app := &App{}

	app.recordDesktopAnimeAction(contracts.MobileAnime{ID: "anime-1", Name: "Frieren"}, "anime.folder_copied", "anime.desktop-action:anime-1:1000")
}

func TestOpenAnimePageRejectsMissingPage(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":0,"active":true}`, 1000)

	opened := false
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := &App{
		ctx:          ctx,
		bridgeDB:     db,
		animeQuery:   anime.NewQueryService(store),
		sharedLogger: sharedlogger.NewFanoutLogger(memLogger),
		openURL: func(context.Context, string) {
			opened = true
		},
	}

	got := app.OpenAnimePage("anime-1")

	if got.Status != "error" {
		t.Fatalf("expected error result, got %#v", got)
	}
	if opened {
		t.Fatal("expected missing page not to open anything")
	}
	if entries := memLogger.Recent(); len(entries) != 0 {
		t.Fatalf("expected no telemetry for a rejected action, got %#v", entries)
	}
}

func TestOpenAnimePageRejectsUnsafeStoredURLAtLaunchSink(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"sourceUrl":"file:///C:/Windows/System32/calc.exe"}`, 1000)
	opened := false
	app := &App{ctx: ctx, animeQuery: anime.NewQueryService(store), openURL: func(context.Context, string) { opened = true }}
	got := app.OpenAnimePage("anime-1")
	if got.Status != "error" || opened {
		t.Fatalf("unsafe stored URL reached BrowserOpenURL: result=%#v opened=%v", got, opened)
	}
}

func TestOpenAnimeFolderRejectsUnsafeStoredPathsAtLaunchSink(t *testing.T) {
	unsafePaths := []string{`\\server\share\anime`, `\\?\C:\Anime`, `relative\anime`, `C:\Anime\..\Windows`}
	for _, unsafePath := range unsafePaths {
		t.Run(unsafePath, func(t *testing.T) {
			ctx := context.Background()
			db := openRuntimeBridgeDB(t)
			store := bridgeSync.NewAnimeSnapshotStore(db)
			seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"folder":`+mustJSONText(t, unsafePath)+`}`, 1000)
			opened := false
			app := &App{ctx: ctx, animeQuery: anime.NewQueryService(store), openFolder: func(string) error { opened = true; return nil }}
			got := app.OpenAnimeFolder("anime-1")
			if got.Status != "error" || opened {
				t.Fatalf("unsafe stored folder reached explorer: result=%#v opened=%v", got, opened)
			}
		})
	}
}

// mustJSONText marshals a test string and fails the test on error.
func mustJSONText(t *testing.T, value string) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal test string: %v", err)
	}
	return string(encoded)
}

// assertDesktopActionEvent verifies the shared-logger event for a desktop
// navigation action (D7): domain "anime", the dotted event type, the anime id
// as entity, the anime name and source in metadata, and the correlation id
// carried over unchanged from the command result.
func assertDesktopActionEvent(t *testing.T, memLogger *sharedlogger.MemLogger, eventType, animeID, animeName, correlationID string) {
	t.Helper()

	entries := memLogger.Recent()
	if len(entries) != 1 {
		t.Fatalf("expected 1 logged event, got %#v", entries)
	}
	entry := entries[0]
	if entry.Domain != "anime" || entry.Level != sharedlogger.LevelInfo || entry.EventType != eventType ||
		entry.EntityID != animeID || entry.CorrelationID != correlationID {
		t.Fatalf("unexpected logged event: %#v", entry)
	}
	if entry.Metadata["animeName"] != animeName || entry.Metadata["source"] != "desktop" {
		t.Fatalf("unexpected event metadata: %#v", entry.Metadata)
	}
}
