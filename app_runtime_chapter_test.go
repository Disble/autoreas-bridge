package main

import (
	"context"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGetChapterScheduleDelegatesToChapterService(t *testing.T) {
	t.Parallel()

	service := &stubAppChapterService{
		schedule: []anime.EpisodeScheduleItem{{AnimeID: "anime-1", AnimeName: "Frieren", DayOrder: 1}},
	}
	app := &App{ctx: context.Background(), episodeService: service}

	got := app.GetChapterSchedule("Viernes")

	if len(got) != 1 || got[0].AnimeID != "anime-1" {
		t.Fatalf("expected delegated chapter schedule, got %#v", got)
	}
	if got[0].AnimeName != "Frieren" || got[0].DayOrder != 1 {
		t.Fatalf("expected chapter schedule contract fields, got %#v", got[0])
	}
	if service.lastDay != "Viernes" {
		t.Fatalf("expected day Viernes to be delegated, got %q", service.lastDay)
	}
}

func TestAdjustWatchedChaptersDelegatesToChapterService(t *testing.T) {
	t.Parallel()

	service := &stubAppChapterService{}
	app := &App{ctx: context.Background(), episodeService: service}

	got := app.AdjustWatchedChapters("anime-1", 0.5, 1000)

	if got.Status != "ok" {
		t.Fatalf("expected ok result, got %#v", got)
	}
	if service.lastAdjust.AnimeID != "anime-1" || service.lastAdjust.Delta != 0.5 {
		t.Fatalf("expected adjust command to be delegated, got %#v", service.lastAdjust)
	}
	if service.lastAdjust.Base == nil || *service.lastAdjust.Base != 1000 {
		t.Fatalf("expected base 1000 to be delegated, got %#v", service.lastAdjust.Base)
	}
}

func TestSetAnimeStateDelegatesToChapterService(t *testing.T) {
	t.Parallel()

	service := &stubAppChapterService{}
	app := &App{ctx: context.Background(), episodeService: service}

	got := app.SetAnimeState("anime-1", 3, 1000)

	if got.Status != "ok" || got.Estado != 3 {
		t.Fatalf("expected ok state result, got %#v", got)
	}
	if service.lastState.AnimeID != "anime-1" || service.lastState.Estado != 3 {
		t.Fatalf("expected state command to be delegated, got %#v", service.lastState)
	}
	if service.lastState.Base == nil || *service.lastState.Base != 1000 {
		t.Fatalf("expected base 1000 to be delegated, got %#v", service.lastState.Base)
	}
}

func TestSoftDeleteAnimeDelegatesToChapterService(t *testing.T) {
	t.Parallel()
	assertChapterActionDelegation(t, "soft-delete", func(app *App) contracts.EpisodeCommandResult { return app.SoftDeleteAnime("anime-1", 1000) }, func(service *stubAppChapterService) (string, *int64) {
		return service.lastSoftDelete.AnimeID, service.lastSoftDelete.Base
	})
}

func TestRestoreAnimeDelegatesToChapterService(t *testing.T) {
	t.Parallel()
	assertChapterActionDelegation(t, "restore", func(app *App) contracts.EpisodeCommandResult { return app.RestoreAnime("anime-1", 1000) }, func(service *stubAppChapterService) (string, *int64) {
		return service.lastRestore.AnimeID, service.lastRestore.Base
	})
}

func TestRepeatAnimeDelegatesToChapterService(t *testing.T) {
	t.Parallel()
	assertChapterActionDelegation(t, "repeat", func(app *App) contracts.EpisodeCommandResult { return app.RepeatAnime("anime-1", 1000) }, func(service *stubAppChapterService) (string, *int64) {
		return service.lastRepeat.AnimeID, service.lastRepeat.Base
	})
}

// assertChapterActionDelegation verifies delegation of a chapter action.
func assertChapterActionDelegation(t *testing.T, action string, invoke func(*App) contracts.EpisodeCommandResult, command func(*stubAppChapterService) (string, *int64)) {
	t.Helper()
	service := &stubAppChapterService{}
	result := invoke(&App{ctx: context.Background(), episodeService: service})
	animeID, base := command(service)
	if result.Status != "ok" || animeID != "anime-1" || base == nil || *base != 1000 {
		t.Fatalf("expected %s command with anime-1 and base 1000, got result=%#v anime=%q base=%#v", action, result, animeID, base)
	}
}

func TestStartupWiresActivityRecorderIntoChapterService(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":1,"estado":0,"activo":true}`, 1000)

	writer := &stubAppUpdateWriter{}
	app := newAppTestApp(t)
	app.ctx = ctx
	app.bridgeDB = db
	app.animeQuery = anime.NewQueryService(store)
	app.animeUpdateWriter = writer
	app.wireEpisodeService(bridgeSync.NewConflictStore(db))

	result := app.AdjustWatchedChapters("anime-1", 1, 1000)
	if result.Status != "ok" {
		t.Fatalf("expected ok chapter adjustment, got %#v", result)
	}

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 persisted activity row, got %#v", records)
	}
	if records[0].AnimeID != "anime-1" || records[0].ActionType != activity.ActionEpisodeAdjusted {
		t.Fatalf("unexpected persisted activity row: %#v", records[0])
	}
}
