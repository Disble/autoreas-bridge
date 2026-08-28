package schedule

import (
	"context"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/testsupport/async"
)

// CancelRun is the user-facing "stop this download" action. Unlike Stop it must
// leave the scheduler itself alive, so tonight's scheduled check still fires.
func TestCancelRunCancelsTheInFlightRunWithoutStoppingTheScheduler(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	runCtxDone := make(chan struct{})
	var once sync.Once
	run := func(ctx context.Context, _ string) (string, error) {
		<-ctx.Done()
		once.Do(func() { close(runCtxDone) })
		return "canceled", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})
	ctx := t.Context()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("TriggerNow error = %v, want nil", err)
	}
	async.Eventually(t, func() bool { return sched.Status(context.Background()).Running },
		"timed out waiting for the run to acquire the guard")

	if !sched.CancelRun() {
		t.Fatalf("CancelRun = false, want true while a run is in flight")
	}

	select {
	case <-runCtxDone:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for the run context to be cancelled")
	}

	// The guard must be released so a new run can still be triggered afterwards.
	async.Eventually(t, func() bool { return !sched.Status(context.Background()).Running },
		"timed out waiting for the cancelled run to release the concurrency guard")
	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("TriggerNow after cancel error = %v, want nil (the scheduler must still accept runs)", err)
	}
	sched.CancelRun()
}

// A finished run leaves its cancel func behind, so "is there a cancel func?" is
// not the same question as "is a run in flight?". Stopping must report honestly
// both before the first run and after one has completed.
func TestCancelRunReportsFalseWhenNoRunIsInFlight(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: func(context.Context, string) (string, error) { return "ok", nil }})

	if sched.CancelRun() {
		t.Fatalf("CancelRun = true, want false before any run has started")
	}

	ctx := t.Context()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("TriggerNow error = %v, want nil", err)
	}
	async.Eventually(t, func() bool { return !sched.Status(context.Background()).Running },
		"timed out waiting for the run to finish")

	if sched.CancelRun() {
		t.Fatalf("CancelRun = true after the run completed, want false")
	}
}
