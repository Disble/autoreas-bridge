package schedule

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
)

func TestResolveMissedStartupDateRunNowSettlesOnExplicitSuccess(t *testing.T) {
	clock := newFakeClock(time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC))
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask}}
	triggers := make(chan string, 1)
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
		Run: func(_ context.Context, trigger string) (string, error) {
			triggers <- trigger
			return download.RunStatusOK, nil
		},
	})

	result := sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionRunNow)
	if result.Kind != MissedStartupActionSettled {
		t.Fatalf("ResolveMissedStartupDate kind = %q, want %q", result.Kind, MissedStartupActionSettled)
	}
	if result.TerminalStatus != download.RunStatusOK {
		t.Fatalf("terminal status = %q, want %q", result.TerminalStatus, download.RunStatusOK)
	}
	if trigger := <-triggers; trigger != "missed_startup" {
		t.Fatalf("run trigger = %q, want missed_startup", trigger)
	}
	if store.cfg.LastSettledLocalDate != "2026-07-26" || store.cfg.LastSettlementReason != download.ScheduleSettlementRunNow {
		t.Fatalf("unexpected settlement state %#v", store.cfg)
	}
	if store.cfg.LastRunStatus != download.RunStatusOK || store.cfg.LastRunAtMs == 0 {
		t.Fatalf("successful Run now facts not recorded: %#v", store.cfg)
	}
}

func TestResolveMissedStartupDateIgnoreSettlesWithoutRunning(t *testing.T) {
	clock := newFakeClock(time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC))
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask, LastRunAtMs: 1000, LastRunStatus: download.RunStatusOK}}
	runCalls := 0
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
		Run: func(_ context.Context, trigger string) (string, error) {
			runCalls++
			return download.RunStatusOK, nil
		},
	})

	result := sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionIgnore)
	if result.Kind != MissedStartupActionSettled {
		t.Fatalf("ResolveMissedStartupDate kind = %q, want %q", result.Kind, MissedStartupActionSettled)
	}
	if runCalls != 0 {
		t.Fatalf("ignore must not invoke the run callback, got %d calls", runCalls)
	}
	if store.cfg.LastRunAtMs != 1000 || store.cfg.LastRunStatus != download.RunStatusOK {
		t.Fatalf("ignore rewrote factual last_run_* fields: %#v", store.cfg)
	}
	if store.cfg.LastSettledLocalDate != "2026-07-26" || store.cfg.NextRunAtMs <= clock.Now().UnixMilli() {
		t.Fatalf("ignore settlement did not persist a future next run: %#v", store.cfg)
	}
}

func TestResolveMissedStartupDateRetainsNoticeForUnsuccessfulRunNow(t *testing.T) {
	clock := newFakeClock(time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC))
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask}}
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
		Run: func(_ context.Context, trigger string) (string, error) {
			return download.RunStatusPartial, nil
		},
	})

	result := sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionRunNow)
	if result.Kind != MissedStartupActionUnresolvedTerminal {
		t.Fatalf("ResolveMissedStartupDate kind = %q, want %q", result.Kind, MissedStartupActionUnresolvedTerminal)
	}
	if result.TerminalStatus != download.RunStatusPartial {
		t.Fatalf("terminal status = %q, want %q", result.TerminalStatus, download.RunStatusPartial)
	}
	if store.cfg.LastSettledLocalDate != "" {
		t.Fatalf("unsuccessful Run now must not settle the date: %#v", store.cfg)
	}
	if store.cfg.LastMissedAttemptDate != "2026-07-26" || store.cfg.LastMissedAttemptStatus != download.RunStatusPartial {
		t.Fatalf("expected unresolved attempt truth to persist, got %#v", store.cfg)
	}
}

func TestResolveMissedStartupDateReturnsRunInProgressWhenAnotherRunOwnsTheGuard(t *testing.T) {
	clock := newFakeClock(time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC))
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask}}
	release := make(chan struct{})
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
		Run: func(ctx context.Context, trigger string) (string, error) {
			<-release
			return download.RunStatusOK, nil
		},
	})

	go func() {
		_ = sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionRunNow)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && !sched.Status(context.Background()).Running {
		time.Sleep(time.Millisecond)
	}
	if !sched.Status(context.Background()).Running {
		t.Fatal("timed out waiting for the first Run now to acquire the guard")
	}

	result := sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionRunNow)
	if result.Kind != MissedStartupActionRunInProgress {
		t.Fatalf("ResolveMissedStartupDate kind = %q, want %q", result.Kind, MissedStartupActionRunInProgress)
	}

	close(release)
}

func TestResolveMissedStartupDateRevalidatesAfterPriorSettlement(t *testing.T) {
	clock := newFakeClock(time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC))
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask, LastSettledLocalDate: "2026-07-26"}}
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
		Run: func(_ context.Context, trigger string) (string, error) {
			return download.RunStatusOK, nil
		},
	})

	result := sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionIgnore)
	if result.Kind != MissedStartupActionAlreadyResolved {
		t.Fatalf("ResolveMissedStartupDate kind = %q, want %q", result.Kind, MissedStartupActionAlreadyResolved)
	}
}

func TestFireScheduledTickCapturesOccurrenceLocalDateBeforeCompletionAndRespectsMonotonicLedger(t *testing.T) {
	start := time.Date(2026, 7, 26, 23, 58, 0, 0, time.UTC)
	clock := newFakeClock(start)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "23:59", EnabledWeekdays: allWeekdaysMask, LastSettledLocalDate: "2026-07-27"}}
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: start.Add(-time.Hour),
		Run: func(_ context.Context, trigger string) (string, error) {
			clock.set(time.Date(2026, 7, 27, 0, 1, 0, 0, time.UTC))
			return download.RunStatusOK, nil
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()

	waitForTimer(t, clock)
	clock.set(time.Date(2026, 7, 26, 23, 59, 0, 0, time.UTC))
	clock.lastTimer().fire(clock.Now())

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if store.cfg.LastRunAtMs == time.Date(2026, 7, 26, 23, 59, 0, 0, time.UTC).UnixMilli() {
			break
		}
		time.Sleep(time.Millisecond)
	}

	if len(store.settlementRequests) == 0 {
		t.Fatal("expected scheduled success to attempt a settlement")
	}
	if store.settlementRequests[0].LocalDate != "2026-07-26" {
		t.Fatalf("occurrence local date = %q, want 2026-07-26", store.settlementRequests[0].LocalDate)
	}
	if store.cfg.LastSettledLocalDate != "2026-07-27" {
		t.Fatalf("later settlement must remain monotonic, got %#v", store.cfg)
	}
}
