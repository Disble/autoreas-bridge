package schedule

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/logger"
)

// runSettledSnapshot is what a reader re-reading on RunSettled would see at that moment, plus
// the settlement the scheduler reported.
type runSettledSnapshot struct {
	settlement RunSettlement
	status     Status
	cfg        download.ScheduleConfig
}

// TestRunSettledFiresOnceTheRunIsRecorded pins the ordering the frontend relies on and the facts
// the desktop records. The run's own terminal event fires from inside the run, before the guard
// is released and before the outcome is stored; RunSettled must fire only after both, so a
// schedule re-read on it shows the finished run instead of the one in flight. Each row captures
// the scheduler's view at the moment RunSettled fires and the settlement it reported.
func TestRunSettledFiresOnceTheRunIsRecorded(t *testing.T) {
	const missedDate = "2026-07-26"
	scheduledAt := time.Date(2026, 7, 26, 21, 0, 0, 0, time.UTC)
	beforeTheTime := scheduledAt.Add(-time.Minute)
	afterTheTime := scheduledAt.Add(30 * time.Minute)
	fireScheduledTick := func(t *testing.T, sched Scheduler, clock *fakeClock) {
		sched.Start(t.Context())
		waitForTimer(t, clock)
		clock.set(scheduledAt)
		clock.lastTimer().fire(clock.Now())
	}
	runMissedDayNow := func(t *testing.T, sched Scheduler, _ *fakeClock) {
		sched.ResolveMissedStartupDate(t.Context(), missedDate, MissedStartupActionRunNow)
	}

	cases := []struct {
		name      string
		now       time.Time
		runStatus string
		runErr    error
		markErr   error
		start     func(t *testing.T, sched Scheduler, clock *fakeClock)
		stored    func(cfg download.ScheduleConfig) bool
		want      RunSettlement
	}{
		{
			name:      "scheduled run: its time, status and next run are stored",
			now:       beforeTheTime,
			runStatus: download.RunStatusOK,
			start:     fireScheduledTick,
			stored: func(cfg download.ScheduleConfig) bool {
				return cfg.LastRunAtMs == scheduledAt.UnixMilli() && cfg.LastRunStatus == download.RunStatusOK
			},
			want: RunSettlement{
				Trigger: "scheduled", Status: download.RunStatusOK, Recorded: true,
				StartedAtMs: scheduledAt.UnixMilli(), NextRunAtMs: scheduledAt.AddDate(0, 0, 1).UnixMilli(),
			},
		},
		{
			name:   "scheduled run that returns an error with no status: recorded as error",
			now:    beforeTheTime,
			runErr: errors.New("store unavailable"),
			start:  fireScheduledTick,
			stored: func(cfg download.ScheduleConfig) bool { return cfg.LastRunStatus == download.RunStatusError },
			want: RunSettlement{
				Trigger: "scheduled", Status: download.RunStatusError, Recorded: true,
				StartedAtMs: scheduledAt.UnixMilli(), NextRunAtMs: scheduledAt.AddDate(0, 0, 1).UnixMilli(),
			},
		},
		{
			name:      "scheduled run whose outcome could not be stored: not recorded",
			now:       beforeTheTime,
			runStatus: download.RunStatusOK,
			markErr:   errors.New("disk full"),
			start:     fireScheduledTick,
			stored:    func(cfg download.ScheduleConfig) bool { return cfg.LastRunAtMs == 0 },
			want:      RunSettlement{Trigger: "scheduled", Status: download.RunStatusOK},
		},
		{
			name:      "manual run: nothing is stored, only the guard is released",
			now:       afterTheTime,
			runStatus: download.RunStatusPartial,
			start: func(t *testing.T, sched Scheduler, _ *fakeClock) {
				if err := sched.TriggerNow(t.Context(), "manual"); err != nil {
					t.Fatalf("TriggerNow = %v, want the run accepted", err)
				}
			},
			stored: func(cfg download.ScheduleConfig) bool { return cfg.LastRunAtMs == 0 },
			want:   RunSettlement{Trigger: "manual", Status: download.RunStatusPartial},
		},
		{
			name:      "missed-day Run now that succeeds: the day is settled",
			now:       afterTheTime,
			runStatus: download.RunStatusOK,
			start:     runMissedDayNow,
			stored: func(cfg download.ScheduleConfig) bool {
				return cfg.LastSettledLocalDate == missedDate && cfg.LastRunStatus == download.RunStatusOK
			},
			want: RunSettlement{Trigger: "missed_startup", Status: download.RunStatusOK, Recorded: true, LocalDate: missedDate},
		},
		{
			name:      "missed-day Run now that does not succeed: the attempt is stored",
			now:       afterTheTime,
			runStatus: download.RunStatusPartial,
			start:     runMissedDayNow,
			stored: func(cfg download.ScheduleConfig) bool {
				return cfg.LastMissedAttemptDate == missedDate && cfg.LastMissedAttemptStatus == download.RunStatusPartial
			},
			want: RunSettlement{Trigger: "missed_startup", Status: download.RunStatusPartial, Recorded: true, LocalDate: missedDate},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clock := newFakeClock(tc.now)
			store := &fakeConfigStore{
				cfg:     download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask},
				markErr: tc.markErr,
			}
			settled := make(chan runSettledSnapshot, 2)

			var sched Scheduler
			sched = NewScheduler(Deps{
				Store:            store,
				Clock:            clock,
				ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
				// Only the scheduled rows start the loop; the others must not wait out a drain for it.
				ShutdownDrainWait: 100 * time.Millisecond,
				Run:               func(context.Context, string) (string, error) { return tc.runStatus, tc.runErr },
				RunSettled: func(settlement RunSettlement) {
					store.mu.Lock()
					cfg := store.cfg
					store.mu.Unlock()
					settled <- runSettledSnapshot{settlement: settlement, status: sched.Status(context.Background()), cfg: cfg}
				},
			})
			defer sched.Stop()

			tc.start(t, sched, clock)

			got := waitForRunSettled(t, settled)
			if got.status.Running {
				t.Fatal("RunSettled fired while the run guard was still held: a re-read on it would show the run in progress")
			}
			if !tc.stored(got.cfg) {
				t.Fatalf("RunSettled fired before the outcome was stored: %#v", got.cfg)
			}
			if got.settlement != tc.want {
				t.Fatalf("settlement = %#v, want %#v", got.settlement, tc.want)
			}
		})
	}
}

// waitForRunSettled returns the first value RunSettled delivered, failing the test if the run
// never settles.
func waitForRunSettled[T any](t *testing.T, settled <-chan T) T {
	t.Helper()
	select {
	case got := <-settled:
		return got
	case <-time.After(5 * time.Second):
		t.Fatal("RunSettled never fired after the run finished")
	}
	var zero T
	return zero
}

// warningsOf returns the warn-level entries the logger kept, oldest first.
func warningsOf(log *logger.MemLogger) []logger.LogEntry {
	var warnings []logger.LogEntry
	for _, entry := range log.Recent() {
		if entry.Level == logger.LevelWarn {
			warnings = append(warnings, entry)
		}
	}
	return warnings
}

// TestRunSettledDoesNotFireForAnIgnoredMissedDay keeps the signal about runs: ignoring a
// missed day starts none, and the desktop announces that settlement on its own event.
func TestRunSettledDoesNotFireForAnIgnoredMissedDay(t *testing.T) {
	clock := newFakeClock(time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC))
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask}}
	fired := 0
	sched := NewScheduler(Deps{
		Store:            store,
		Clock:            clock,
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
		RunSettled:       func(RunSettlement) { fired++ },
	})

	result := sched.ResolveMissedStartupDate(context.Background(), "2026-07-26", MissedStartupActionIgnore)

	if result.Kind != MissedStartupActionSettled {
		t.Fatalf("Ignore kind = %q, want %q", result.Kind, MissedStartupActionSettled)
	}
	if fired != 0 {
		t.Fatalf("RunSettled fired %d times for an ignored day, want 0: no run took place", fired)
	}
}

// TestScheduledRunWarnsWhenItsDayCannotBeSettled keeps a failed settlement visible. It used to be
// discarded; the warning is what Activity's System section and the request MCP can show.
func TestScheduledRunWarnsWhenItsDayCannotBeSettled(t *testing.T) {
	cases := []struct {
		name      string
		settleErr error
		wantWarn  bool
	}{
		{name: "the settlement fails: one warning naming the day and the cause", settleErr: errors.New("database is locked"), wantWarn: true},
		{name: "the settlement succeeds: no warning"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			scheduledAt := time.Date(2026, 7, 26, 21, 0, 0, 0, time.UTC)
			clock := newFakeClock(scheduledAt.Add(-time.Minute))
			store := &fakeConfigStore{
				cfg:       download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: allWeekdaysMask},
				settleErr: tc.settleErr,
			}
			log := logger.NewMemLogger(logger.MemLoggerConfig{})
			settled := make(chan struct{}, 1)
			sched := NewScheduler(Deps{
				Store:      store,
				Clock:      clock,
				Log:        log,
				Run:        func(context.Context, string) (string, error) { return download.RunStatusOK, nil },
				RunSettled: func(RunSettlement) { settled <- struct{}{} },
			})
			sched.Start(t.Context())
			defer sched.Stop()
			waitForTimer(t, clock)
			clock.set(scheduledAt)
			clock.lastTimer().fire(clock.Now())

			waitForRunSettled(t, settled)

			warnings := warningsOf(log)
			if !tc.wantWarn {
				if len(warnings) != 0 {
					t.Fatalf("warnings = %#v, want none after a successful settlement", warnings)
				}
				return
			}
			want := "schedule: failed to settle the scheduled run for 2026-07-26: database is locked"
			if len(warnings) != 1 || warnings[0].Message != want || warnings[0].Domain != "download" {
				t.Fatalf("warnings = %#v, want one download-domain warning %q", warnings, want)
			}
		})
	}
}
