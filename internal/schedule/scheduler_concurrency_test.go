package schedule

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/download"

	"autoreas-bridge/internal/testsupport/async"
)

func TestScheduledTickDuringActiveRunIsSkippedSilently(t *testing.T) {
	now := time.Date(2026, 6, 22, 9, 59, 0, 0, time.UTC)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00", EnabledWeekdays: allWeekdaysMask}}
	clock := newFakeClock(now)

	release := make(chan struct{})
	started := make(chan string, 4)
	run := func(ctx context.Context, trigger string) (string, error) {
		started <- trigger
		select {
		case <-release:
		case <-ctx.Done():
		}
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx := t.Context()
	sched.Start(ctx)
	defer sched.Stop()

	waitForTimer(t, clock)
	clock.set(now.Add(time.Minute))
	clock.lastTimer().fire(clock.Now())

	select {
	case trigger := <-started:
		if trigger != "scheduled" {
			t.Fatalf("first trigger = %q, want scheduled", trigger)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first scheduled run to start")
	}

	waitForTimer(t, clock)
	clock.set(clock.Now().Add(24 * time.Hour))
	clock.lastTimer().fire(clock.Now())

	select {
	case trigger := <-started:
		t.Fatalf("a second scheduled tick reached run() while a run was active (trigger=%q); it must be skipped", trigger)
	case <-time.After(200 * time.Millisecond):
	}

	close(release)
}

func TestTriggerNowReturnsErrRunInProgressWhenAManualRunIsActive(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	release := make(chan struct{})
	run := func(ctx context.Context, _ string) (string, error) {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx := t.Context()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	go func() {
		_ = sched.TriggerNow(context.Background(), "manual")
	}()

	async.Eventually(t, func() bool { return sched.Status(context.Background()).Running },
		"timed out waiting for the first manual run to acquire the guard")

	err := sched.TriggerNow(context.Background(), "manual")
	if !errors.Is(err, ErrRunInProgress) {
		t.Fatalf("TriggerNow error = %v, want ErrRunInProgress", err)
	}

	close(release)
}

func TestTriggerNowReturnsAfterAcceptingRunWithoutWaitingForCompletion(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	release := make(chan struct{})
	runStarted := make(chan struct{})
	run := func(ctx context.Context, _ string) (string, error) {
		close(runStarted)
		select {
		case <-release:
		case <-ctx.Done():
		}
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx := t.Context()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("TriggerNow error = %v, want nil", err)
	}

	select {
	case <-runStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for accepted manual run to start")
	}
	if !sched.Status(context.Background()).Running {
		t.Fatal("expected TriggerNow to leave an observable running state before completion")
	}

	close(release)
}

func TestStopReturnsWithinDrainBoundEvenWithAnInFlightRun(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	runStarted := make(chan struct{})
	run := func(ctx context.Context, _ string) (string, error) {
		close(runStarted)
		<-ctx.Done()
		return "error", ctx.Err()
	}

	sched := NewScheduler(Deps{
		Store:             store,
		Clock:             clock,
		Run:               run,
		ShutdownDrainWait: 50 * time.Millisecond,
	})

	ctx := t.Context()
	sched.Start(ctx)
	waitForTimer(t, clock)

	go func() {
		_ = sched.TriggerNow(context.Background(), "manual")
	}()
	<-runStarted

	stopDone := make(chan struct{})
	start := time.Now()
	go func() {
		sched.Stop()
		close(stopDone)
	}()

	select {
	case <-stopDone:
		elapsed := time.Since(start)
		if elapsed > time.Second {
			t.Fatalf("Stop() took %v, want bounded by a short drain timeout", elapsed)
		}
	case <-time.After(time.Second):
		t.Fatal("Stop() did not return -- it blocked on the in-flight run instead of bounded-draining it")
	}
}

func TestRunExceedingMaxDurationReleasesTheConcurrentRunGuard(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	run := func(ctx context.Context, _ string) (string, error) {
		<-ctx.Done()
		return "error", ctx.Err()
	}

	sched := NewScheduler(Deps{
		Store:          store,
		Clock:          clock,
		Run:            run,
		MaxRunDuration: 10 * time.Millisecond,
	})

	ctx := t.Context()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("unexpected error starting the wedged run: %v", err)
	}

	async.Eventually(t, func() bool { return !sched.Status(context.Background()).Running },
		"running guard was never released after the run exceeded MaxRunDuration")

	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("TriggerNow after guard release = %v, want nil (guard must not be held forever)", err)
	}
}
