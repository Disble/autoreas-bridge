package main

import (
	"context"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/schedule"
)

type fakeAppDownloadStore struct {
	jdConfig       download.JDConfig
	scheduleConfig download.ScheduleConfig
	hosterPriority []download.HosterPriorityEntry
	runs           []download.Run
	openedRuns     []download.Run
	finalizedRuns  []download.Run
	finalized      chan download.Run

	setHosterPriorityEntries []download.HosterPriorityEntry
	setJDConfigCfg           download.JDConfig
	setJDConfigPassword      *string
	setScheduleConfigCfg     download.ScheduleConfig
}

func (f *fakeAppDownloadStore) ListHosterPriority(context.Context, string) ([]download.HosterPriorityEntry, error) {
	return f.hosterPriority, nil
}

func (f *fakeAppDownloadStore) SetHosterPriority(_ context.Context, _ string, entries []download.HosterPriorityEntry) error {
	f.setHosterPriorityEntries = entries
	return nil
}

func (f *fakeAppDownloadStore) SeedHosterPriorityIfEmpty(context.Context, string, []download.HosterPriorityEntry) error {
	return nil
}

func (f *fakeAppDownloadStore) GetJDConfig(context.Context) (download.JDConfig, error) {
	return f.jdConfig, nil
}

func (f *fakeAppDownloadStore) SetJDConfig(_ context.Context, cfg download.JDConfig, password *string) error {
	f.setJDConfigCfg = cfg
	f.setJDConfigPassword = password
	return nil
}

func (f *fakeAppDownloadStore) SetJDStatus(context.Context, string, int64) error { return nil }

func (f *fakeAppDownloadStore) DecryptedPassword(context.Context) (string, bool, error) {
	return "", false, nil
}

func (f *fakeAppDownloadStore) GetScheduleConfig(context.Context) (download.ScheduleConfig, error) {
	return f.scheduleConfig, nil
}

func (f *fakeAppDownloadStore) SetScheduleConfig(_ context.Context, cfg download.ScheduleConfig) error {
	f.setScheduleConfigCfg = cfg
	return nil
}

func (f *fakeAppDownloadStore) MarkScheduleRun(context.Context, int64, string, int64) error {
	return nil
}

func (f *fakeAppDownloadStore) OpenRun(_ context.Context, run download.Run) error {
	f.openedRuns = append(f.openedRuns, run)
	return nil
}

func (f *fakeAppDownloadStore) UpdateRunProgress(context.Context, download.Run) error {
	return nil
}

func (f *fakeAppDownloadStore) FinalizeRun(_ context.Context, run download.Run) error {
	f.finalizedRuns = append(f.finalizedRuns, run)
	if f.finalized != nil {
		f.finalized <- run
	}
	return nil
}

func (f *fakeAppDownloadStore) ListRuns(context.Context, int) ([]download.Run, error) {
	return f.runs, nil
}

func (f *fakeAppDownloadStore) ReconcileInterruptedRuns(context.Context, int64) (int, error) {
	return 0, nil
}

var _ download.Store = (*fakeAppDownloadStore)(nil)

type fakeAppScheduler struct {
	triggerNowCalls          int
	notifyConfigChangedCalls int
	triggerNowErr            error
	status                   schedule.Status
}

func (f *fakeAppScheduler) Start(context.Context) {}

func (f *fakeAppScheduler) Stop() {}

func (f *fakeAppScheduler) NotifyConfigChanged() { f.notifyConfigChangedCalls++ }

func (f *fakeAppScheduler) TriggerNow(context.Context, string) error {
	f.triggerNowCalls++
	return f.triggerNowErr
}

func (f *fakeAppScheduler) Status(context.Context) schedule.Status {
	return f.status
}

var _ schedule.Scheduler = (*fakeAppScheduler)(nil)
