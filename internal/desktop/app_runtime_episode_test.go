package desktop

import (
	"context"
	"errors"
	"fmt"
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
func episodesApp(service episodeCommandService, state lifecycle.State) *App {
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
		{"service error is internal", stubAppEpisodeService{err: errors.New("snapshot read failed")}, lifecycle.StateReady, 0, apperr.CodeInternal, "snapshot read failed"},
		{"ready answers the rows", rows, lifecycle.StateReady, 1, "", ""},
		{"ready empty day is an empty list", stubAppEpisodeService{}, lifecycle.StateReady, 0, "", ""},
	}
	for _, read := range episodeReads {
		t.Run(read.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			service := rows
			app := episodesApp(&service, lifecycle.StateStarting)
			got, isNil, err := read.call(app)
			assertEpisodeRead(t, got, isNil, err, 0, apperr.CodeUnavailable, "episodes is starting")

			inModuleState(app, moduleEpisodes, lifecycle.StateFailed)
			got, isNil, err = read.call(app)
			assertEpisodeRead(t, got, isNil, err, 0, apperr.CodeFailedPrecondition, "bridge database failed to open: locked")
		})
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

// baseOf renders a delegated base stamp, -1 when the command carried none.
func baseOf(base *int64) int64 {
	if base == nil {
		return -1
	}
	return *base
}

// episodeCommands calls each episodes command binding, and describes the command the service
// received: what a stub that was never called describes differs from want.
var episodeCommands = []struct {
	name      string
	call      func(*App) (contracts.EpisodeCommandResult, error)
	delegated func(*stubAppEpisodeService) string
	want      string
}{
	{
		name: "AdjustWatchedEpisodes",
		call: func(a *App) (contracts.EpisodeCommandResult, error) {
			return a.AdjustWatchedEpisodes("anime-1", 0.5, 1000)
		},
		delegated: func(s *stubAppEpisodeService) string {
			return fmt.Sprintf("%s %v %d %s", s.lastAdjust.AnimeID, s.lastAdjust.Delta, baseOf(s.lastAdjust.Base), s.lastAdjust.Source)
		},
		want: "anime-1 0.5 1000 desktop",
	},
	{
		name: "SetAnimeState",
		call: func(a *App) (contracts.EpisodeCommandResult, error) { return a.SetAnimeState("anime-1", 3, 1000) },
		delegated: func(s *stubAppEpisodeService) string {
			return fmt.Sprintf("%s %d %d %s", s.lastState.AnimeID, s.lastState.Estado, baseOf(s.lastState.Base), s.lastState.Source)
		},
		want: "anime-1 3 1000 desktop",
	},
	{
		name: "SetAnimeDays",
		call: func(a *App) (contracts.EpisodeCommandResult, error) {
			return a.SetAnimeDays("anime-1", []string{"Lunes"}, 1000)
		},
		delegated: func(s *stubAppEpisodeService) string {
			return fmt.Sprintf("%s %v %d", s.lastDays.AnimeID, s.lastDays.Dias, baseOf(s.lastDays.Base))
		},
		want: "anime-1 [Lunes] 1000",
	},
	{
		name: "SoftDeleteAnime",
		call: func(a *App) (contracts.EpisodeCommandResult, error) { return a.SoftDeleteAnime("anime-1", 1000) },
		delegated: func(s *stubAppEpisodeService) string {
			return fmt.Sprintf("%s %d %s", s.lastSoftDelete.AnimeID, baseOf(s.lastSoftDelete.Base), s.lastSoftDelete.Source)
		},
		want: "anime-1 1000 desktop",
	},
	{
		name: "RestoreAnime",
		call: func(a *App) (contracts.EpisodeCommandResult, error) { return a.RestoreAnime("anime-1", 1000) },
		delegated: func(s *stubAppEpisodeService) string {
			return fmt.Sprintf("%s %d %s", s.lastRestore.AnimeID, baseOf(s.lastRestore.Base), s.lastRestore.Source)
		},
		want: "anime-1 1000 desktop",
	},
	{
		name: "RepeatAnime",
		call: func(a *App) (contracts.EpisodeCommandResult, error) { return a.RepeatAnime("anime-1", 1000) },
		delegated: func(s *stubAppEpisodeService) string {
			return fmt.Sprintf("%s %d %s", s.lastRepeat.AnimeID, baseOf(s.lastRepeat.Base), s.lastRepeat.Source)
		},
		want: "anime-1 1000 desktop",
	},
}

// TestEpisodeCommandsFollowTheEpisodesModule pins S1 for the episodes commands: none reaches the
// service or answers an outcome while the module starts or after it failed, a service failure is
// the binding's error with no outcome, and a ready module answers the outcome of the delegated command.
func TestEpisodeCommandsFollowTheEpisodesModule(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		service  stubAppEpisodeService
		state    lifecycle.State
		wantCode apperr.Code
		wantMsg  string
	}{
		{"service error is internal", stubAppEpisodeService{err: errors.New("anime write failed")}, lifecycle.StateReady, apperr.CodeInternal, "anime write failed"},
		{"ready answers the outcome", stubAppEpisodeService{}, lifecycle.StateReady, "", ""},
	}
	for _, command := range episodeCommands {
		t.Run(command.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			service := stubAppEpisodeService{}
			app := episodesApp(&service, lifecycle.StateStarting)
			got, err := command.call(app)
			assertEpisodeCommand(t, got, err, apperr.CodeUnavailable, "episodes is starting")

			inModuleState(app, moduleEpisodes, lifecycle.StateFailed)
			got, err = command.call(app)
			assertEpisodeCommand(t, got, err, apperr.CodeFailedPrecondition, "bridge database failed to open: locked")

			if delegated := command.delegated(&service); delegated == command.want {
				t.Fatalf("service received %q before the module was ready", delegated)
			}
		})
		for _, tc := range cases {
			t.Run(command.name+"/"+tc.name, func(t *testing.T) {
				t.Parallel()
				service := tc.service // a copy per subtest: the stub records the command it received
				got, err := command.call(episodesApp(&service, tc.state))

				assertEpisodeCommand(t, got, err, tc.wantCode, tc.wantMsg)
				reachedService := tc.state == lifecycle.StateReady
				if delegated := command.delegated(&service); (delegated == command.want) != reachedService {
					t.Fatalf("service received %q; reached the service %t, want %t", delegated, delegated == command.want, reachedService)
				}
			})
		}
	}
}

// assertEpisodeCommand checks one episodes command: a failure carries its code and message and no
// outcome; a success is the ok outcome for anime-1.
func assertEpisodeCommand(t *testing.T, got contracts.EpisodeCommandResult, err error, wantCode apperr.Code, wantMsg string) {
	t.Helper()
	code, _ := apperr.CodeOf(err)
	if code != wantCode || (err != nil && (err.Error() != wantMsg || got != contracts.EpisodeCommandResult{})) {
		t.Fatalf("got %#v, code %q (err %v), want code %q %q and no outcome", got, code, err, wantCode, wantMsg)
	}
	if err == nil && (got.Status != "ok" || got.AnimeID != "anime-1") {
		t.Fatalf("got %#v, want the ok outcome for anime-1", got)
	}
}

func TestSetAnimeStateAnswersTheAppliedState(t *testing.T) {
	t.Parallel()

	got, err := episodesApp(&stubAppEpisodeService{}, lifecycle.StateReady).SetAnimeState("anime-1", 3, 1000)

	if err != nil || got.Status != "ok" || got.AnimeStatus != 3 {
		t.Fatalf("expected ok state result, got %#v (err %v)", got, err)
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
	app.settleModules(moduleEpisodes)

	result, err := app.AdjustWatchedEpisodes("anime-1", 1, 1000)
	if err != nil || result.Status != "ok" {
		t.Fatalf("expected ok episode adjustment, got %#v (err %v)", result, err)
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
