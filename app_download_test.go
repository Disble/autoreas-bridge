package main

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/schedule"
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

func TestListDownloadRunsDelegatesToStore(t *testing.T) {
	t.Parallel()

	finishedAt := int64(1750000001000)
	store := &fakeAppDownloadStore{
		runs: []download.DownloadRun{{RunID: "run-1", StartedAtMs: 1750000000000, FinishedAtMs: &finishedAt, Status: "ok", AnimesChecked: 3}},
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
	if value.Kind() != reflect.Ptr || value.IsNil() {
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
