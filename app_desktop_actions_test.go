package main

import (
	"context"
	"database/sql"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestOpenAnimePageOpensPageAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":2,"estado":0,"activo":true,"pagina":"https://anime.example/frieren"}`, 1000)

	var openedURL string
	app := &App{
		ctx:        ctx,
		bridgeDB:   db,
		animeQuery: anime.NewQueryService(store),
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
	assertDesktopActionActivity(t, db, activity.ActionAnimePageOpened)
}

func TestCopyAnimeFolderCopiesFolderAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":2,"estado":0,"activo":true,"carpeta":"C:/Anime/Frieren"}`, 1000)

	var copiedText string
	app := &App{
		ctx:        ctx,
		bridgeDB:   db,
		animeQuery: anime.NewQueryService(store),
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
	assertDesktopActionActivity(t, db, activity.ActionAnimeFolderCopied)
}

func TestOpenAnimePageRejectsMissingPage(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":2,"estado":0,"activo":true}`, 1000)

	opened := false
	app := &App{
		ctx:        ctx,
		bridgeDB:   db,
		animeQuery: anime.NewQueryService(store),
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
	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("expected no activity rows, got %#v", records)
	}
}

func assertDesktopActionActivity(t *testing.T, db *sql.DB, actionType string) {
	t.Helper()

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(context.Background(), activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 activity row, got %#v", records)
	}
	if records[0].Source != activity.SourceDesktop || records[0].ActionType != actionType {
		t.Fatalf("unexpected activity row: %#v", records[0])
	}
}
