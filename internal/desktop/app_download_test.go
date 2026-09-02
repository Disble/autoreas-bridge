package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/schedule"
)

func TestGetDownloadConfigReturnsZeroValueWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.GetDownloadConfig()
	if got.JD.Email != "" || got.Schedule.Enabled || len(got.HosterPriority) != 0 {
		t.Fatalf("expected zero-value DownloadConfig when store is nil, got %#v", got)
	}
}

func TestGetDownloadConfigStoreNilSerializesEmptyHosterPriorityArray(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	payload, err := json.Marshal(app.GetDownloadConfig())
	if err != nil {
		t.Fatalf("marshal download config: %v", err)
	}

	if got := string(payload); !strings.Contains(got, `"hosterPriority":[]`) {
		t.Fatalf("expected hosterPriority to serialize as an empty array for frontend safety, got %s", got)
	}
}

func TestSetHosterPriorityReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.SetHosterPriority("jkanime", []contracts.HosterPriorityItem{{Hoster: "Mega", Priority: 0, Enabled: true}})
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when store is nil, got %q", got)
	}
}

func TestGetJDStatusReturnsZeroValueWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.GetJDStatus()
	if got.Email != "" || got.HasPassword || got.LastSeenStatus != "" {
		t.Fatalf("expected zero-value JDStatus when store is nil, got %#v", got)
	}
}

func TestSetJDConfigReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.SetJDConfig(contracts.JDConfigInput{Email: "user@example.com"})
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when store is nil, got %q", got)
	}
}

func TestGetScheduleConfigReturnsZeroValueWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.GetScheduleConfig()
	if got.Enabled || got.DailyTimeHHMM != "" {
		t.Fatalf("expected zero-value ScheduleConfig when store is nil, got %#v", got)
	}
}

func TestSetScheduleConfigReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.SetScheduleConfig(contracts.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true})
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when store is nil, got %q", got)
	}
}

func TestTriggerDownloadCheckReturnsErrorStringWhenSchedulerNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	got := app.TriggerDownloadCheck()
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when scheduler is nil, got %q", got)
	}
}

func TestListDownloadRunsReturnsEmptyWhenStoreNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}
	if got := app.ListDownloadRuns(); len(got) != 0 {
		t.Fatalf("expected empty run list when store is nil, got %#v", got)
	}
}

func TestListDownloadReadinessReturnsEmptyArraysForEmptyCatalog(t *testing.T) {
	service := download.NewReadinessService(download.ReadinessServiceDeps{
		Animes:        &stubAnimeQueryService{},
		DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
		Sites:         download.NewStaticRegistry(),
	})
	app := &App{ctx: context.Background(), readinessService: service}

	got, err := app.ListDownloadReadiness()
	if err != nil || len(got.Items) != 0 || got.Items == nil {
		t.Fatalf("readiness = %#v, err=%v; want successful empty array", got, err)
	}
	payload, marshalErr := json.Marshal(got)
	if marshalErr != nil || !strings.Contains(string(payload), `"items":[]`) {
		t.Fatalf("readiness payload = %s, err=%v; want items []", payload, marshalErr)
	}
}

func TestListDownloadReadinessReturnsQueryErrorWithoutFabricatingSnapshot(t *testing.T) {
	queryErr := errors.New("catalog unavailable")
	service := download.NewReadinessService(download.ReadinessServiceDeps{
		Animes:        &stubAnimeQueryService{err: queryErr},
		DownloadsRoot: func(context.Context) (string, error) { return "D:/Downloads", nil },
		Sites:         download.NewStaticRegistry(),
	})
	app := &App{ctx: context.Background(), readinessService: service}

	got, err := app.ListDownloadReadiness()
	if !errors.Is(err, queryErr) {
		t.Fatalf("readiness error = %v, want %v", err, queryErr)
	}
	if got.Items != nil {
		t.Fatalf("failed readiness returned fabricated items: %#v", got.Items)
	}
}

func TestGetDownloadConfigDelegatesToStore(t *testing.T) {
	t.Parallel()

	store := &fakeAppDownloadStore{
		jdConfig:       download.JDConfig{Email: "user@example.com", DeviceName: "MyPC"},
		scheduleConfig: download.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true},
		hosterPriority: []download.HosterPriorityEntry{{Hoster: "Mega", Priority: 0, Enabled: true}},
	}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.GetDownloadConfig()
	if got.JD.Email != "user@example.com" || got.JD.DeviceName != "MyPC" {
		t.Fatalf("expected JD config to be delegated, got %#v", got.JD)
	}
	if got.Schedule.DailyTimeHHMM != "09:00" || !got.Schedule.Enabled {
		t.Fatalf("expected schedule config to be delegated, got %#v", got.Schedule)
	}
	if len(got.HosterPriority) != 1 || got.HosterPriority[0].Hoster != "Mega" {
		t.Fatalf("expected hoster priority to be delegated, got %#v", got.HosterPriority)
	}
}

// The hoster ordering the download engine obeys is the one stored under the
// canonical site. GetDownloadConfig must read THAT site and echo it back, so the
// editor persists where the engine reads instead of writing to a site nobody
// consults (the "reorder does nothing" bug: writes landed under "default" while
// the resolver read "jkanime").
func TestGetDownloadConfigReadsAndEchoesTheCanonicalHosterPrioritySite(t *testing.T) {
	t.Parallel()

	store := &fakeAppDownloadStore{
		hosterPriority: []download.HosterPriorityEntry{{Hoster: "Mega", Priority: 0, Enabled: true}},
	}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.GetDownloadConfig()
	if store.listHosterPrioritySite != config.DefaultHosterPrioritySite {
		t.Fatalf("expected the canonical site %q to be read, got %q", config.DefaultHosterPrioritySite, store.listHosterPrioritySite)
	}
	if got.HosterPrioritySite != config.DefaultHosterPrioritySite {
		t.Fatalf("expected the config to echo site %q, got %q", config.DefaultHosterPrioritySite, got.HosterPrioritySite)
	}
}

func TestSetHosterPriorityPersistsViaStore(t *testing.T) {
	t.Parallel()

	store := &fakeAppDownloadStore{}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.SetHosterPriority("jkanime", []contracts.HosterPriorityItem{{Hoster: "Mediafire", Priority: 0, Enabled: true}})
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if len(store.setHosterPriorityEntries) != 1 || store.setHosterPriorityEntries[0].Hoster != "Mediafire" {
		t.Fatalf("expected hoster priority to be persisted, got %#v", store.setHosterPriorityEntries)
	}
}

func TestSetJDConfigPersistsViaStore(t *testing.T) {
	t.Parallel()

	store := &fakeAppDownloadStore{}
	app := &App{ctx: context.Background(), downloadStore: store}

	password := "secret"
	got := app.SetJDConfig(contracts.JDConfigInput{Email: "new@example.com", PlaintextPassword: &password})
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if store.setJDConfigCfg.Email != "new@example.com" {
		t.Fatalf("expected email to be persisted, got %#v", store.setJDConfigCfg)
	}
	if store.setJDConfigPassword == nil || *store.setJDConfigPassword != password {
		t.Fatalf("expected password to be forwarded, got %#v", store.setJDConfigPassword)
	}
}

func TestSetScheduleConfigPersistsViaStore(t *testing.T) {
	t.Parallel()

	store := &fakeAppDownloadStore{}
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), downloadStore: store, downloadScheduler: sched}

	got := app.SetScheduleConfig(contracts.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "20:30", Enabled: true})
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if store.setScheduleConfigCfg.DailyTimeHHMM != "20:30" {
		t.Fatalf("expected schedule config to be persisted, got %#v", store.setScheduleConfigCfg)
	}
	if sched.notifyConfigChangedCalls != 1 {
		t.Fatalf("expected scheduler config-change notification once, got %d", sched.notifyConfigChangedCalls)
	}
}

func TestSetScheduleConfigMapsEnabledWeekdaysIntoDomainStore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   int
		want byte
	}{
		{name: "all days enabled (127)", in: 127, want: 127},
		{name: "empty mask (0)", in: 0, want: 0},
		{name: "arbitrary mask", in: 21, want: 21},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeAppDownloadStore{}
			app := &App{ctx: context.Background(), downloadStore: store}

			got := app.SetScheduleConfig(contracts.ScheduleConfig{
				Mode:            "in_process",
				DailyTimeHHMM:   "09:00",
				Enabled:         true,
				EnabledWeekdays: tc.in,
			})
			if got != "ok" {
				t.Fatalf("expected ok, got %q", got)
			}
			if store.setScheduleConfigCfg.EnabledWeekdays != tc.want {
				t.Fatalf("expected domain EnabledWeekdays = %d, got %d", tc.want, store.setScheduleConfigCfg.EnabledWeekdays)
			}
		})
	}
}

func TestGetScheduleConfigMapsEnabledWeekdaysFromDomainStore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   byte
		want int
	}{
		{name: "all days enabled (127)", in: 127, want: 127},
		{name: "empty mask (0)", in: 0, want: 0},
		{name: "arbitrary mask", in: 21, want: 21},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeAppDownloadStore{
				scheduleConfig: download.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true, EnabledWeekdays: tc.in},
			}
			app := &App{ctx: context.Background(), downloadStore: store}

			got := app.GetScheduleConfig()
			if got.EnabledWeekdays != tc.want {
				t.Fatalf("expected contract EnabledWeekdays = %d, got %d", tc.want, got.EnabledWeekdays)
			}
		})
	}
}

func TestGetScheduleConfigSurfacesProcessStartAwareMissedNotice(t *testing.T) {
	t.Parallel()

	fixedNow := time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC)
	store := &fakeAppDownloadStore{
		scheduleConfig: download.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "21:00", Enabled: true, EnabledWeekdays: 1 << time.Sunday},
	}
	app := &App{
		ctx:              context.Background(),
		downloadStore:    store,
		nowTime:          func() time.Time { return fixedNow },
		processStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
	}

	got := app.GetScheduleConfig()
	if got.MissedNotice == nil {
		t.Fatal("expected missed notice to be surfaced")
	}
	if got.MissedNotice.LocalDate != "2026-07-26" {
		t.Fatalf("missed notice local date = %q, want 2026-07-26", got.MissedNotice.LocalDate)
	}
}

func TestGetScheduleConfigTreatsCurrentSuccessfulRunFactsAsResolvedDuringUpgrade(t *testing.T) {
	t.Parallel()

	fixedNow := time.Date(2026, 7, 26, 22, 0, 0, 0, time.UTC)
	store := &fakeAppDownloadStore{
		scheduleConfig: download.ScheduleConfig{
			Mode:            "in_process",
			DailyTimeHHMM:   "21:00",
			Enabled:         true,
			EnabledWeekdays: 1 << time.Sunday,
			LastRunAtMs:     time.Date(2026, 7, 26, 21, 10, 0, 0, time.UTC).UnixMilli(),
			LastRunStatus:   download.RunStatusOK,
		},
	}
	app := &App{
		ctx:              context.Background(),
		downloadStore:    store,
		nowTime:          func() time.Time { return fixedNow },
		processStartedAt: time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC),
	}

	got := app.GetScheduleConfig()
	if got.MissedNotice != nil {
		t.Fatalf("expected upgrade-safe successful run facts to suppress a false notice, got %#v", got.MissedNotice)
	}
}

func TestGetDownloadConfigSharesTheMissedNoticeOverlay(t *testing.T) {
	t.Parallel()

	fixedNow := time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC)
	store := &fakeAppDownloadStore{
		jdConfig:       download.JDConfig{Email: "user@example.com"},
		scheduleConfig: download.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "21:00", Enabled: true, EnabledWeekdays: 1 << time.Sunday},
	}
	app := &App{
		ctx:              context.Background(),
		downloadStore:    store,
		nowTime:          func() time.Time { return fixedNow },
		processStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
	}

	got := app.GetDownloadConfig()
	if got.Schedule.MissedNotice == nil || got.Schedule.MissedNotice.LocalDate != "2026-07-26" {
		t.Fatalf("expected GetDownloadConfig to reuse the missed-notice overlay, got %#v", got.Schedule.MissedNotice)
	}
}

func TestRunMissedScheduleNowDelegatesToSchedulerOwnedAction(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{Kind: schedule.MissedStartupActionSettled, LocalDate: "2026-07-26", TerminalStatus: download.RunStatusOK, SettlementReason: download.ScheduleSettlementRunNow}}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	got := app.RunMissedScheduleNow("2026-07-26")
	if got.Kind != string(schedule.MissedStartupActionSettled) || got.TerminalStatus != download.RunStatusOK {
		t.Fatalf("unexpected RunMissedScheduleNow result %#v", got)
	}
	if len(sched.resolveMissedCalls) != 1 || sched.resolveMissedCalls[0] != "run_now:2026-07-26" {
		t.Fatalf("expected scheduler-owned Run now call, got %#v", sched.resolveMissedCalls)
	}
}

func TestIgnoreMissedScheduleDelegatesToSchedulerOwnedAction(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{Kind: schedule.MissedStartupActionSettled, LocalDate: "2026-07-26", SettlementReason: download.ScheduleSettlementIgnored}}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	got := app.IgnoreMissedSchedule("2026-07-26")
	if got.Kind != string(schedule.MissedStartupActionSettled) || got.SettlementReason != string(download.ScheduleSettlementIgnored) {
		t.Fatalf("unexpected IgnoreMissedSchedule result %#v", got)
	}
	if len(sched.resolveMissedCalls) != 1 || sched.resolveMissedCalls[0] != "ignore:2026-07-26" {
		t.Fatalf("expected scheduler-owned Ignore call, got %#v", sched.resolveMissedCalls)
	}
}

func TestTriggerDownloadCheckDelegatesToScheduler(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	if got := app.TriggerDownloadCheck(); got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if sched.triggerNowCalls != 1 {
		t.Fatalf("expected TriggerNow to be called once, got %d", sched.triggerNowCalls)
	}
}

func TestTriggerDownloadCheckSurfacesErrRunInProgress(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{triggerNowErr: schedule.ErrRunInProgress}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	if got := app.TriggerDownloadCheck(); got != schedule.ErrRunInProgress.Error() {
		t.Fatalf("expected ErrRunInProgress message, got %q", got)
	}
}

func TestTriggerAnimeDownloadReturnsUnavailableWhenServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{}}
	got := app.TriggerAnimeDownload("anime-1")
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when download service is nil, got %q", got)
	}
}

func TestTriggerAnimeDownloadRunsSelectedAnimeOnly(t *testing.T) {
	t.Parallel()

	page := "https://jkanime.net/frieren"
	folder := "D:/Anime/Frieren"
	store := &fakeAppDownloadStore{finalized: make(chan download.Run, 1)}
	service := download.NewService(download.ServiceDeps{
		Store:    store,
		Clock:    func() time.Time { return time.UnixMilli(1_750_000_000_000) },
		NewRunID: func() string { return "run-solo" },
	})
	app := &App{
		ctx:             context.Background(),
		downloadService: service,
		animeQuery: &stubAnimeQueryService{
			mobileAnime: &contracts.MobileAnime{
				ID:        "anime-1",
				Name:      "Frieren",
				Active:    1,
				SourceURL: &page,
				Folder:    &folder,
			},
		},
	}

	if got := app.TriggerAnimeDownload("anime-1"); got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}

	select {
	case run := <-store.finalized:
		if run.RunID != "run-solo" || run.Trigger != "manual_anime" {
			t.Fatalf("unexpected solo run %#v", run)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for solo download run to finalize")
	}
}

func TestTriggerAnimeDownloadRejectsWhileSchedulerRunning(t *testing.T) {
	t.Parallel()

	service := download.NewService(download.ServiceDeps{})
	app := &App{
		ctx:               context.Background(),
		downloadService:   service,
		animeQuery:        &stubAnimeQueryService{},
		downloadScheduler: &fakeAppScheduler{status: schedule.Status{Running: true}},
	}

	if got := app.TriggerAnimeDownload("anime-1"); got != schedule.ErrRunInProgress.Error() {
		t.Fatalf("expected ErrRunInProgress message, got %q", got)
	}
}

func TestListDownloadRunsDelegatesToStore(t *testing.T) {
	t.Parallel()

	finishedAt := int64(1750000001000)
	store := &fakeAppDownloadStore{
		runs: []download.Run{{RunID: "run-1", StartedAtMs: 1750000000000, FinishedAtMs: &finishedAt, Status: "ok", AnimesChecked: 3}},
	}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.ListDownloadRuns()
	if len(got) != 1 {
		t.Fatalf("expected one run, got %#v", got)
	}
	if got[0].RunID != "run-1" || got[0].Status != "ok" || got[0].AnimesChecked != 3 {
		t.Fatalf("unexpected run view: %#v", got[0])
	}
	if got[0].FinishedAtMs == nil || *got[0].FinishedAtMs != finishedAt {
		t.Fatalf("expected FinishedAtMs to be forwarded, got %#v", got[0].FinishedAtMs)
	}
}

func TestNewJDownloaderClientSuppliesNonNilLogger(t *testing.T) {
	t.Parallel()

	client := newJDownloaderClient("user@example.com", "secret")
	value := reflect.ValueOf(client)
	if value.Kind() != reflect.Pointer || value.IsNil() {
		t.Fatalf("expected concrete pointer client, got %T", client)
	}

	logField := value.Elem().FieldByName("log")
	if !logField.IsValid() {
		t.Fatal("expected jdownloader client to expose internal log field")
	}
	if logField.IsNil() {
		t.Fatal("expected jdownloader client logger to be non-nil")
	}
}

func TestListDownloadReadinessNamesUnwiredServiceSoTheCauseIsNotGeneric(t *testing.T) {
	app := &App{ctx: context.Background()}

	got, err := app.ListDownloadReadiness()
	if err == nil {
		t.Fatalf("readiness = %#v, want an error when the service was never wired", got)
	}
	if !strings.Contains(err.Error(), "not wired at startup") {
		t.Fatalf("readiness error = %q; want it to name the unwired service so the UI can show a cause", err)
	}
	if got.Items != nil {
		t.Fatalf("unwired readiness returned fabricated items: %#v", got.Items)
	}
}

func TestCancelDownloadRunReportsWhenNoRunIsInProgress(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{cancelRunResult: false}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	if got := app.CancelDownloadRun(); got != "no download run in progress" {
		t.Fatalf("expected the idle message, got %q", got)
	}
	if sched.cancelRunCalls != 1 {
		t.Fatalf("expected the scheduler to be asked once, got %d", sched.cancelRunCalls)
	}
}

func TestCancelDownloadRunCancelsAScheduledOrManualRun(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{cancelRunResult: true}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	if got := app.CancelDownloadRun(); got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
}

// A single-anime run is started by the App itself, not the scheduler, so the
// scheduler cannot cancel it -- the App has to hold its own cancel.
func TestCancelDownloadRunCancelsAnInFlightSoloAnimeRun(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), downloadScheduler: &fakeAppScheduler{cancelRunResult: false}}
	soloCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	app.setSoloDownloadCancel(cancel)

	if got := app.CancelDownloadRun(); got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if soloCtx.Err() == nil {
		t.Fatalf("expected the solo run context to be cancelled")
	}
}

func TestCancelDownloadRunDegradesWhenNothingIsWired(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background()}

	if got := app.CancelDownloadRun(); got != "no download run in progress" {
		t.Fatalf("expected the idle message with no scheduler, got %q", got)
	}
}
