package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	sharedlogger "autoreas-bridge/internal/logger"
	bridgeSync "autoreas-bridge/internal/sync"
)

// desktopActionApp returns an App whose ready anime module reads one stored anime with payload,
// and the logger its actions record to.
func desktopActionApp(t *testing.T, payload string) (*App, *sharedlogger.MemLogger) {
	t.Helper()
	store := bridgeSync.NewAnimeSnapshotStore(openRuntimeBridgeDB(t))
	seedRuntimeAnimeSnapshot(t, store, "anime-1", payload, 1000)
	app := readyAnimeApp(editorServices(store))
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)
	return app, memLogger
}

func TestOpenAnimePageOpensPageAndRecordsActivity(t *testing.T) {
	app, memLogger := desktopActionApp(t, `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":0,"active":true,"sourceUrl":"https://anime.example/frieren"}`)
	var openedURL string
	app.openURL = func(_ context.Context, url string) { openedURL = url }

	got, err := app.OpenAnimePage("anime-1")

	if err != nil || got.Status != "ok" || got.AnimeID != "anime-1" || got.AnimeName != "Frieren" {
		t.Fatalf("expected ok result, got %#v, %v", got, err)
	}
	if openedURL != "https://anime.example/frieren" {
		t.Fatalf("expected page URL to be opened, got %q", openedURL)
	}
	assertDesktopActionEvent(t, memLogger, "anime.page_opened", "anime-1", "Frieren", got.CorrelationID)
}

func TestCopyAnimeFolderCopiesFolderAndRecordsActivity(t *testing.T) {
	app, memLogger := desktopActionApp(t, `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":0,"active":true,"folder":"C:/Anime/Frieren"}`)
	var copiedText string
	app.copyText = func(_ context.Context, value string) error {
		copiedText = value
		return nil
	}

	got, err := app.CopyAnimeFolder("anime-1")

	if err != nil || got.Status != "ok" {
		t.Fatalf("expected ok result, got %#v, %v", got, err)
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

// TestDesktopActionsMapTheirFailures pins each failure the ready actions answer as a coded error
// with a zero result, without launching anything or recording an action.
func TestDesktopActionsMapTheirFailures(t *testing.T) {
	cases := []struct {
		name     string
		payload  string
		call     func(*App) (contracts.EpisodeCommandResult, error)
		copyErr  error
		wantCode apperr.Code
		wantMsg  string
	}{
		{"unknown anime is not found", `{"id":"anime-1","name":"Frieren"}`, func(a *App) (contracts.EpisodeCommandResult, error) { return a.OpenAnimePage("missing") }, nil, apperr.CodeNotFound, "anime not found"},
		{"missing page is an invalid argument", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":0,"active":true}`, openPageOfAnime1, nil, apperr.CodeInvalidArgument, "anime action value unavailable"},
		{"blank folder is an invalid argument", `{"id":"anime-1","name":"Frieren","folder":"  "}`, copyFolderOfAnime1, nil, apperr.CodeInvalidArgument, "anime action value unavailable"},
		{"failed copy is internal", `{"id":"anime-1","name":"Frieren","folder":"C:/Anime/Frieren"}`, copyFolderOfAnime1, errors.New("clipboard busy"), apperr.CodeInternal, "clipboard busy"},
	}
	for _, tc := range cases {
		app, memLogger := desktopActionApp(t, tc.payload)
		app.openURL = func(context.Context, string) { t.Errorf("%s: a failed action opened a page", tc.name) }
		app.copyText = func(context.Context, string) error { return tc.copyErr }

		got, err := tc.call(app)

		assertAnimeFailure(t, tc.name, got, err, tc.wantCode, tc.wantMsg)
		if entries := memLogger.Recent(); len(entries) != 0 {
			t.Errorf("%s: expected no telemetry for a rejected action, got %#v", tc.name, entries)
		}
	}
}

// openPageOfAnime1 opens the page of the anime the failure cases store.
func openPageOfAnime1(a *App) (contracts.EpisodeCommandResult, error) {
	return a.OpenAnimePage("anime-1")
}

// copyFolderOfAnime1 copies the folder of the anime the failure cases store.
func copyFolderOfAnime1(a *App) (contracts.EpisodeCommandResult, error) {
	return a.CopyAnimeFolder("anime-1")
}

func TestOpenAnimePageRejectsUnsafeStoredURLAtLaunchSink(t *testing.T) {
	app, _ := desktopActionApp(t, `{"id":"anime-1","name":"Frieren","episodesWatched":2,"sourceUrl":"file:///C:/Windows/System32/calc.exe"}`)
	opened := false
	app.openURL = func(context.Context, string) { opened = true }
	got, err := app.OpenAnimePage("anime-1")
	if code, _ := apperr.CodeOf(err); err == nil || code != apperr.CodeInternal || got.Status != "" || opened {
		t.Fatalf("unsafe stored URL reached BrowserOpenURL: result=%#v err=%v opened=%v", got, err, opened)
	}
}

func TestOpenAnimeFolderRejectsUnsafeStoredPathsAtLaunchSink(t *testing.T) {
	unsafePaths := []string{`\\server\share\anime`, `\\?\C:\Anime`, `relative\anime`, `C:\Anime\..\Windows`}
	for _, unsafePath := range unsafePaths {
		t.Run(unsafePath, func(t *testing.T) {
			app, _ := desktopActionApp(t, `{"id":"anime-1","name":"Frieren","episodesWatched":2,"folder":`+mustJSONText(t, unsafePath)+`}`)
			opened := false
			app.openFolder = func(string) error { opened = true; return nil }
			got, err := app.OpenAnimeFolder("anime-1")
			if code, _ := apperr.CodeOf(err); err == nil || code != apperr.CodeInternal || got.Status != "" || opened {
				t.Fatalf("unsafe stored folder reached explorer: result=%#v err=%v opened=%v", got, err, opened)
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
