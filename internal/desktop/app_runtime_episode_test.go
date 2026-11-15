package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// episodesApp returns an App whose episodes handle serves service, in the given module state.
func episodesApp(service *stubAppEpisodeService, state lifecycle.State) *App {
	app := &App{ctx: context.Background(), episodeService: service}
	app.moduleSet().episodes.Bind(episodeServices{episodes: service})
	switch state {
	case lifecycle.StateReady:
		app.settleModules(moduleEpisodes)
	case lifecycle.StateFailed:
		_ = app.moduleSet().writer.MarkFailed(moduleEpisodes, "bridge database failed to open: locked")
	}
	return app
}

// episodeReads calls each episodes binding that runs through the handle: the row count, whether
// the slice is nil, and the error.
var episodeReads = []struct {
	name string
	call func(*App) (rows int, isNil bool, err error)
}{
	{"GetEpisodeSchedule", func(a *App) (int, bool, error) {
		got, err := a.GetEpisodeSchedule("Viernes")
		return len(got), got == nil, err
	}},
	{"GetEpisodeDayCounts", func(a *App) (int, bool, error) {
		got, err := a.GetEpisodeDayCounts()
		return len(got), got == nil, err
	}},
}

// TestEpisodeReadsFollowTheEpisodesModule pins the Today bug (S9): neither read answers an empty
// slice while the module starts, after it failed, or when the service fails.
func TestEpisodeReadsFollowTheEpisodesModule(t *testing.T) {
	t.Parallel()
	rows := stubAppEpisodeService{
		schedule:  []anime.EpisodeScheduleItem{{AnimeID: "anime-1"}},
		dayCounts: []anime.EpisodeDayCount{{Day: "Viernes", Count: 1}},
	}
	cases := []struct {
		name     string
		service  stubAppEpisodeService
		state    lifecycle.State
		wantRows int
		wantCode apperr.Code
		wantMsg  string
	}{
		{"starting is unavailable", rows, lifecycle.StateStarting, 0, apperr.CodeUnavailable, "episodes is starting"},
		{"failed is a failed precondition", rows, lifecycle.StateFailed, 0, apperr.CodeFailedPrecondition, "bridge database failed to open: locked"},
		{"service error is internal", stubAppEpisodeService{err: errors.New("snapshot read failed")}, lifecycle.StateReady, 0, apperr.CodeInternal, "snapshot read failed"},
		{"ready answers the rows", rows, lifecycle.StateReady, 1, "", ""},
		{"ready empty day is an empty list", stubAppEpisodeService{}, lifecycle.StateReady, 0, "", ""},
	}
	for _, read := range episodeReads {
		for _, tc := range cases {
			t.Run(read.name+"/"+tc.name, func(t *testing.T) {
				t.Parallel()
				service := tc.service // a copy per subtest: the stub records the day it was asked
				rows, isNil, err := read.call(episodesApp(&service, tc.state))

				assertEpisodeRead(t, rows, isNil, err, tc.wantRows, tc.wantCode, tc.wantMsg)
			})
		}
	}
}

// assertEpisodeRead checks one episodes read: a failure carries its code and message and no slice;
// a success carries wantRows rows in a non-nil slice.
func assertEpisodeRead(t *testing.T, rows int, isNil bool, err error, wantRows int, wantCode apperr.Code, wantMsg string) {
	t.Helper()
	code, _ := apperr.CodeOf(err)
	if code != wantCode || rows != wantRows {
		t.Fatalf("got %d rows, code %q (err %v), want %d rows, code %q", rows, code, err, wantRows, wantCode)
	}
	if err != nil && (err.Error() != wantMsg || !isNil) {
		t.Fatalf("err = %q with nil slice %t, want %q and no slice", err, isNil, wantMsg)
	}
	if err == nil && isNil {
		t.Fatal("a ready read answered a nil slice; the frontend needs [] for an empty day")
	}
}

func TestGetEpisodeScheduleDelegatesToEpisodeService(t *testing.T) {
	t.Parallel()

	service := &stubAppEpisodeService{
		schedule: []anime.EpisodeScheduleItem{{AnimeID: "anime-1", AnimeName: "Frieren", DayOrder: 1}},
	}
	app := episodesApp(service, lifecycle.StateReady)

	got, err := app.GetEpisodeSchedule("Viernes")

	if err != nil || len(got) != 1 || got[0].AnimeID != "anime-1" {
		t.Fatalf("expected delegated episode schedule, got %#v (err %v)", got, err)
	}
	if got[0].AnimeName != "Frieren" || got[0].DayOrder != 1 {
		t.Fatalf("expected episode schedule contract fields, got %#v", got[0])
	}
	if service.lastDay != "Viernes" {
		t.Fatalf("expected day Viernes to be delegated, got %q", service.lastDay)
	}
}

func TestAdjustWatchedEpisodesDelegatesToEpisodeService(t *testing.T) {
	t.Parallel()

	service := &stubAppEpisodeService{}
	app := &App{ctx: context.Background(), episodeService: service}

	got := app.AdjustWatchedEpisodes("anime-1", 0.5, 1000)

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

func TestSetAnimeStateDelegatesToEpisodeService(t *testing.T) {
	t.Parallel()

	service := &stubAppEpisodeService{}
	app := &App{ctx: context.Background(), episodeService: service}

	got := app.SetAnimeState("anime-1", 3, 1000)

	if got.Status != "ok" || got.AnimeStatus != 3 {
		t.Fatalf("expected ok state result, got %#v", got)
	}
	if service.lastState.AnimeID != "anime-1" || service.lastState.Estado != 3 {
		t.Fatalf("expected state command to be delegated, got %#v", service.lastState)
	}
	if service.lastState.Base == nil || *service.lastState.Base != 1000 {
		t.Fatalf("expected base 1000 to be delegated, got %#v", service.lastState.Base)
	}
}

func TestSoftDeleteAnimeDelegatesToEpisodeService(t *testing.T) {
	t.Parallel()
	assertEpisodeActionDelegation(t, "soft-delete", func(app *App) contracts.EpisodeCommandResult { return app.SoftDeleteAnime("anime-1", 1000) }, func(service *stubAppEpisodeService) (string, *int64) {
		return service.lastSoftDelete.AnimeID, service.lastSoftDelete.Base
	})
}

func TestRestoreAnimeDelegatesToEpisodeService(t *testing.T) {
	t.Parallel()
	assertEpisodeActionDelegation(t, "restore", func(app *App) contracts.EpisodeCommandResult { return app.RestoreAnime("anime-1", 1000) }, func(service *stubAppEpisodeService) (string, *int64) {
		return service.lastRestore.AnimeID, service.lastRestore.Base
	})
}

func TestRepeatAnimeDelegatesToEpisodeService(t *testing.T) {
	t.Parallel()
	assertEpisodeActionDelegation(t, "repeat", func(app *App) contracts.EpisodeCommandResult { return app.RepeatAnime("anime-1", 1000) }, func(service *stubAppEpisodeService) (string, *int64) {
		return service.lastRepeat.AnimeID, service.lastRepeat.Base
	})
}

// assertEpisodeActionDelegation verifies delegation of an episode action.
func assertEpisodeActionDelegation(t *testing.T, action string, invoke func(*App) contracts.EpisodeCommandResult, command func(*stubAppEpisodeService) (string, *int64)) {
	t.Helper()
	service := &stubAppEpisodeService{}
	result := invoke(&App{ctx: context.Background(), episodeService: service})
	animeID, base := command(service)
	if result.Status != "ok" || animeID != "anime-1" || base == nil || *base != 1000 {
		t.Fatalf("expected %s command with anime-1 and base 1000, got result=%#v anime=%q base=%#v", action, result, animeID, base)
	}
}

func TestStartupWiresActivityRecorderIntoEpisodeService(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":1,"status":0,"active":true}`, 1000)

	writer := &stubAppCommittedPublisher{}
	app := newAppTestApp(t)
	app.ctx = ctx
	app.bridgeDB = db
	app.animeQuery = anime.NewQueryService(store)
	app.animeChangedPublisher = writer
	app.wireEpisodeService(bridgeSync.NewConflictStore(db))

	result := app.AdjustWatchedEpisodes("anime-1", 1, 1000)
	if result.Status != "ok" {
		t.Fatalf("expected ok episode adjustment, got %#v", result)
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

	page, err := watchhistory.NewStore(db).Page(ctx, watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("page watch history: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].AnimeID != "anime-1" || page.Items[0].Episode != 2 {
		t.Fatalf("expected startup to wire watchRecorderAdapter into episodeService, got %#v", page.Items)
	}
}
