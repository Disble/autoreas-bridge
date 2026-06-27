package schedule

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
)

func TestSchedulerDoesNotInvokeRunCallbackWhenScheduleDisabled(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false, DailyTimeHHMM: "10:00"}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	called := make(chan struct{}, 1)
	run := func(_ context.Context, _ string) (string, error) {
		called <- struct{}{}
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx, cancel := context.WithCancel(context.Background())
	sched.Start(ctx)

	waitForTimer(t, clock)
	clock.lastTimer().fire(clock.Now())
	waitForTimer(t, clock)
	cancel()
	sched.Stop()

	select {
	case <-called:
		t.Fatal("run callback invoked while schedule disabled")
	default:
	}
}

func TestSchedulerNeverFiresWhenEnabledWeekdaysMaskIsEmpty(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00", EnabledWeekdays: 0}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	called := make(chan struct{}, 1)
	run := func(_ context.Context, _ string) (string, error) {
		called <- struct{}{}
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx, cancel := context.WithCancel(context.Background())
	sched.Start(ctx)

	waitForTimer(t, clock)
	clock.lastTimer().fire(clock.Now())
	waitForTimer(t, clock)
	cancel()
	sched.Stop()

	select {
	case <-called:
		t.Fatal("run callback invoked with an empty weekday mask")
	default:
	}
}

func TestSchedulerInvokesRunCallbackWithScheduledTriggerWhenDue(t *testing.T) {
	now := time.Date(2026, 6, 22, 9, 59, 0, 0, time.UTC)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00", EnabledWeekdays: allWeekdaysMask}}
	clock := newFakeClock(now)

	called := make(chan string, 1)
	run := func(_ context.Context, trigger string) (string, error) {
		called <- trigger
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()

	waitForTimer(t, clock)
	clock.set(now.Add(time.Minute))
	clock.lastTimer().fire(clock.Now())

	select {
	case trigger := <-called:
		if trigger != "scheduled" {
			t.Fatalf("trigger = %q, want %q", trigger, "scheduled")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for scheduled run callback invocation")
	}
}

func TestSchedulerReReadsConfigImmediatelyAfterScheduleSave(t *testing.T) {
	now := time.Date(2026, 6, 22, 9, 59, 15, 0, time.UTC)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false, DailyTimeHHMM: "10:00", EnabledWeekdays: allWeekdaysMask}}
	clock := newFakeClock(now)

	called := make(chan string, 1)
	run := func(_ context.Context, trigger string) (string, error) {
		called <- trigger
		return "ok", nil
	}

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: run})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()

	waitForTimer(t, clock)
	firstTimerCount := clock.timerCount()

	store.mu.Lock()
	store.cfg.Enabled = true
	store.mu.Unlock()
	sched.NotifyConfigChanged()
	waitForTimerCount(t, clock, firstTimerCount+1)

	clock.set(time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC))
	clock.lastTimer().fire(clock.Now())

	select {
	case trigger := <-called:
		if trigger != "scheduled" {
			t.Fatalf("trigger = %q, want scheduled", trigger)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for scheduled run after config-change wakeup")
	}
}

func TestScheduledTickMarksLastRunAfterCompletion(t *testing.T) {
	now := time.Date(2026, 6, 22, 9, 59, 0, 0, time.UTC)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00", EnabledWeekdays: allWeekdaysMask}}
	clock := newFakeClock(now)

	sched := NewScheduler(Deps{
		Store: store,
		Clock: clock,
		Run: func(_ context.Context, trigger string) (string, error) {
			if trigger != "scheduled" {
				t.Fatalf("trigger = %q, want scheduled", trigger)
			}
			return "partial", nil
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()

	waitForTimer(t, clock)
	firedAt := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)
	clock.set(firedAt)
	clock.lastTimer().fire(clock.Now())

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		store.mu.Lock()
		lastRunAtMs := store.cfg.LastRunAtMs
		lastRunStatus := store.cfg.LastRunStatus
		nextRunAtMs := store.cfg.NextRunAtMs
		store.mu.Unlock()

		if lastRunAtMs == firedAt.UnixMilli() && lastRunStatus == "partial" && nextRunAtMs > firedAt.UnixMilli() {
			return
		}
		time.Sleep(time.Millisecond)
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	t.Fatalf("scheduled run mark = lastAt %d status %q nextAt %d, want lastAt %d status partial and future nextAt",
		store.cfg.LastRunAtMs, store.cfg.LastRunStatus, store.cfg.NextRunAtMs, firedAt.UnixMilli())
}

func TestNextLastRunAccessorsReflectScheduleConfigAfterMarkScheduleRun(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{
		Enabled:       true,
		DailyTimeHHMM: "10:00",
		LastRunAtMs:   1000,
		LastRunStatus: "ok",
		NextRunAtMs:   2000,
	}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: func(context.Context, string) (string, error) { return "ok", nil }})

	status := sched.Status(context.Background())
	if status.LastRunAtMs != 1000 || status.LastRunStatus != "ok" || status.NextRunAtMs != 2000 {
		t.Fatalf("Status() = %+v, want it to mirror the persisted ScheduleConfig", status)
	}
}
