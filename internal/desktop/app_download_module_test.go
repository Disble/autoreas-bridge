package desktop

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/schedule"
)

// emptyReadinessService is a readiness service over an empty catalog.
func emptyReadinessService() *download.ReadinessService {
	return download.NewReadinessService(download.ReadinessServiceDeps{
		Animes:      &stubAnimeQueryService{},
		LibraryRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
		Sites:       download.NewStaticRegistry(),
	})
}

// inDownloadsState fills every download service app leaves nil with a fake, binds them
// through the production bind step and moves the downloads module to state.
func inDownloadsState(app *App, state lifecycle.State) *App {
	if app.ctx == nil {
		app.ctx = context.Background()
	}
	if app.animeQuery == nil {
		app.animeQuery = &stubAnimeQueryService{}
	}
	if app.downloadStore == nil {
		app.downloadStore = &fakeAppDownloadStore{}
	}
	if app.downloadScheduler == nil {
		app.downloadScheduler = &fakeAppScheduler{}
	}
	if app.downloadService == nil {
		app.downloadService = download.NewService(download.ServiceDeps{})
	}
	if app.readinessService == nil {
		app.readinessService = emptyReadinessService()
	}
	app.bindDownloadsModule()
	return inModuleState(app, moduleDownloads, state)
}

// downloadsReady is inDownloadsState for a ready module.
func downloadsReady(app *App) *App {
	return inDownloadsState(app, lifecycle.StateReady)
}

// servedAs maps an error to a module answer: want proves a ready module ran the binding, and
// anything else is the binding's answer as it came.
func servedAs(err, want error) (bool, error) {
	if err != nil && err.Error() == want.Error() {
		return true, nil
	}
	return err == nil, err
}

// downloadBindings are every downloads binding: the call reports whether the answer is the one
// a ready module serves over inDownloadsState's fakes.
var downloadBindings = []struct {
	name string
	call func(*App) (bool, error)
}{
	{"GetDownloadConfig", func(a *App) (bool, error) {
		got, err := a.GetDownloadConfig()
		return got.HosterPriority != nil, err
	}},
	{"SetHosterPriority", func(a *App) (bool, error) {
		err := a.SetHosterPriority("jkanime", nil)
		return err == nil, err
	}},
	{"GetJDStatus", func(a *App) (bool, error) {
		_, err := a.GetJDStatus()
		return err == nil, err
	}},
	{"SetJDConfig", func(a *App) (bool, error) {
		err := a.SetJDConfig(contracts.JDConfigInput{Email: "user@example.com"})
		return err == nil, err
	}},
	{"GetScheduleConfig", func(a *App) (bool, error) {
		_, err := a.GetScheduleConfig()
		return err == nil, err
	}},
	{"SetScheduleConfig", func(a *App) (bool, error) {
		err := a.SetScheduleConfig(contracts.ScheduleConfig{Mode: "daily"})
		return err == nil, err
	}},
	{"RunMissedScheduleNow", func(a *App) (bool, error) {
		got, err := a.RunMissedScheduleNow("2026-07-26")
		return got.LocalDate == "2026-07-26", err
	}},
	{"IgnoreMissedSchedule", func(a *App) (bool, error) {
		got, err := a.IgnoreMissedSchedule("2026-07-26")
		return got.LocalDate == "2026-07-26", err
	}},
	{"TriggerDownloadCheck", func(a *App) (bool, error) {
		err := a.TriggerDownloadCheck()
		return err == nil, err
	}},
	{"TriggerAnimeDownload", func(a *App) (bool, error) {
		return servedAs(a.TriggerAnimeDownload("anime-unknown"), errors.New(soloDownloadAnimeNotFound))
	}},
	{"TriggerSeasonDownloads", func(a *App) (bool, error) {
		err := a.TriggerSeasonDownloads()
		return err == nil, err
	}},
	{"DownloadSeasonAnimes", func(a *App) (bool, error) {
		return servedAs(a.DownloadSeasonAnimes([]string{"anime-unknown"}), errors.New(soloDownloadAnimeNotFound))
	}},
	{"CancelDownloadRun", func(a *App) (bool, error) {
		return servedAs(a.CancelDownloadRun(), errNoDownloadRunInProgress)
	}},
	{"ListDownloadRuns", func(a *App) (bool, error) {
		got, err := a.ListDownloadRuns()
		return got != nil, err
	}},
	{"ListDownloadReadiness", func(a *App) (bool, error) {
		got, err := a.ListDownloadReadiness()
		return got.Items != nil, err
	}},
}

// TestDownloadBindingsFollowTheirModule pins S1 for downloads: no downloads binding answers a
// zero configuration, an empty run list or a status string while its module starts or after it
// failed, and every one serves its value once it is ready.
func TestDownloadBindingsFollowTheirModule(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		state    lifecycle.State
		wantCode apperr.Code
		wantMsg  string
	}{
		{"starting is unavailable", lifecycle.StateStarting, apperr.CodeUnavailable, "downloads is starting"},
		{"failed is a failed precondition", lifecycle.StateFailed, apperr.CodeFailedPrecondition, moduleFailureReason},
		{"ready answers the value", lifecycle.StateReady, "", ""},
	}
	for _, binding := range downloadBindings {
		for _, tc := range cases {
			t.Run(binding.name+"/"+tc.name, func(t *testing.T) {
				t.Parallel()
				served, err := binding.call(inDownloadsState(&App{}, tc.state))
				assertModuleAnswer(t, served, err, tc.wantCode, tc.wantMsg)
			})
		}
	}
}

// TestDownloadStoreFailuresAreInternal pins that a failing store read or write reaches the
// frontend as an internal failure with its cause, where the binding used to answer a zero
// configuration, an empty run list or the error as a status string.
func TestDownloadStoreFailuresAreInternal(t *testing.T) {
	t.Parallel()
	failure := errors.New("disk I/O error")
	cases := []struct {
		name   string
		method string
		call   func(*App) error
	}{
		{"GetDownloadConfig jd", "GetJDConfig", func(a *App) error { _, err := a.GetDownloadConfig(); return err }},
		{"GetDownloadConfig schedule", "GetScheduleConfig", func(a *App) error { _, err := a.GetDownloadConfig(); return err }},
		{"GetDownloadConfig hosters", "ListHosterPriority", func(a *App) error { _, err := a.GetDownloadConfig(); return err }},
		{"GetJDStatus", "GetJDConfig", func(a *App) error { _, err := a.GetJDStatus(); return err }},
		{"GetScheduleConfig", "GetScheduleConfig", func(a *App) error { _, err := a.GetScheduleConfig(); return err }},
		{"ListDownloadRuns", "ListRuns", func(a *App) error { _, err := a.ListDownloadRuns(); return err }},
		{"SetHosterPriority", "SetHosterPriority", func(a *App) error { return a.SetHosterPriority("jkanime", nil) }},
		{"SetJDConfig", "SetJDConfig", func(a *App) error { return a.SetJDConfig(contracts.JDConfigInput{}) }},
		{"SetScheduleConfig", "SetScheduleConfig", func(a *App) error { return a.SetScheduleConfig(contracts.ScheduleConfig{}) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &fakeAppDownloadStore{errs: map[string]error{tc.method: failure}}
			err := tc.call(downloadsReady(&App{downloadStore: store}))
			assertInternal(t, err, failure.Error())
			if !errors.Is(err, failure) {
				t.Fatalf("err = %v; want the store's cause reachable", err)
			}
		})
	}
}

// assertInternal fails t unless err is an internal failure carrying message.
func assertInternal(t *testing.T, err error, message string) {
	t.Helper()
	if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal || err.Error() != message {
		t.Fatalf("err = %v (code %q); want internal %q", err, code, message)
	}
}

// TestDownloadCommandRefusalsAreErrors pins that a refused command is the binding's error with
// the refusal's message, which the Downloads screen shows as it did the old status string.
func TestDownloadCommandRefusalsAreErrors(t *testing.T) {
	t.Parallel()
	running := &fakeAppScheduler{status: schedule.Status{Running: true}}
	cases := []struct {
		name     string
		app      *App
		call     func(*App) error
		wantCode apperr.Code
		wantMsg  string
	}{
		{"manual check while a run is in progress", &App{downloadScheduler: &fakeAppScheduler{triggerNowErr: schedule.ErrRunInProgress}},
			(*App).TriggerDownloadCheck, apperr.CodeInternal, schedule.ErrRunInProgress.Error()},
		{"solo download while the scheduler runs", &App{downloadScheduler: running},
			func(a *App) error { return a.TriggerAnimeDownload("anime-1") }, apperr.CodeInternal, schedule.ErrRunInProgress.Error()},
		{"solo download of an unknown anime", &App{},
			func(a *App) error { return a.TriggerAnimeDownload("anime-1") }, apperr.CodeNotFound, soloDownloadAnimeNotFound},
		{"stop with no run in flight", &App{}, (*App).CancelDownloadRun, apperr.CodeInternal, "no download run in progress"},
		{"season download while a run is in progress", &App{downloadScheduler: &fakeAppScheduler{triggerNowErr: schedule.ErrRunInProgress}},
			(*App).TriggerSeasonDownloads, apperr.CodeInternal, schedule.ErrRunInProgress.Error()},
		{"season download the scheduler cannot start", &App{downloadScheduler: &fakeAppScheduler{triggerNowErr: errors.New("jdownloader unreachable")}},
			(*App).TriggerSeasonDownloads, apperr.CodeInternal, "jdownloader unreachable"},
		{"season selection with nothing selected", &App{},
			func(a *App) error { return a.DownloadSeasonAnimes(nil) }, apperr.CodeInvalidArgument, seasonNoAnimesSelectedMessage},
		{"season selection while the scheduler runs", &App{downloadScheduler: running},
			func(a *App) error { return a.DownloadSeasonAnimes([]string{"anime-1"}) }, apperr.CodeInternal, schedule.ErrRunInProgress.Error()},
		{"season selection of an unknown anime", &App{},
			func(a *App) error { return a.DownloadSeasonAnimes([]string{"anime-1"}) }, apperr.CodeNotFound, soloDownloadAnimeNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.call(downloadsReady(tc.app))
			if code, _ := apperr.CodeOf(err); code != tc.wantCode || err.Error() != tc.wantMsg {
				t.Fatalf("err = %v (code %q); want %q %q", err, code, tc.wantCode, tc.wantMsg)
			}
		})
	}
}

// TestSetScheduleConfigWakesTheSchedulerOnlyAfterAStoredWrite pins that a failed write leaves
// the scheduler planning from the value it already has.
func TestSetScheduleConfigWakesTheSchedulerOnlyAfterAStoredWrite(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{}
	store := &fakeAppDownloadStore{errs: map[string]error{"SetScheduleConfig": errors.New("disk full")}}

	if err := downloadsReady(&App{downloadStore: store, downloadScheduler: sched}).SetScheduleConfig(contracts.ScheduleConfig{}); err == nil {
		t.Fatal("SetScheduleConfig = nil; want the store's error")
	}
	if sched.notifyConfigChangedCalls != 0 {
		t.Fatalf("NotifyConfigChanged calls = %d; want 0 after a failed write", sched.notifyConfigChangedCalls)
	}
}

// TestBindDownloadsModuleNeedsEveryService proves the bind step binds nothing while one
// download service is missing, so a module the wiring check would fail never serves without it.
func TestBindDownloadsModuleNeedsEveryService(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		prune func(*App)
	}{
		{"store", func(a *App) { a.downloadStore = nil }},
		{"service", func(a *App) { a.downloadService = nil }},
		{"readiness", func(a *App) { a.readinessService = nil }},
		{"scheduler", func(a *App) { a.downloadScheduler = nil }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := &App{
				ctx:               context.Background(),
				downloadStore:     &fakeAppDownloadStore{},
				downloadService:   download.NewService(download.ServiceDeps{}),
				readinessService:  emptyReadinessService(),
				downloadScheduler: &fakeAppScheduler{},
			}
			tc.prune(app)

			app.bindDownloadsModule()
			_ = app.moduleSet().writer.MarkReady(moduleDownloads)

			if _, err := app.GetJDStatus(); err == nil || !strings.Contains(err.Error(), "downloads is ready without services") {
				t.Fatalf("GetJDStatus = %v; want the unbound-module failure", err)
			}
		})
	}
}
