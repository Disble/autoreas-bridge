// Package schedule tests for the in-process scheduler (design.md §3.5/§6). All tests use an
// INJECTED fake clock (no real sleeping) and an injected run-callback seam, per design.md §3.9
// "every dependency is an interface" discipline and the PR4a brief's explicit ban on real time.
package schedule

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
)

// fakeTimer is a controllable timer the test drives manually via fire(). It satisfies the
// schedule.Timer seam (C()/Stop()/Reset()).
type fakeTimer struct {
	mu   sync.Mutex
	ch   chan time.Time
	dur  time.Duration
	stop bool
}

func newFakeTimer(d time.Duration) *fakeTimer {
	return &fakeTimer{ch: make(chan time.Time, 1), dur: d}
}

func (t *fakeTimer) C() <-chan time.Time { return t.ch }

func (t *fakeTimer) Stop() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	wasRunning := !t.stop
	t.stop = true
	return wasRunning
}

func (t *fakeTimer) Reset(d time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.dur = d
	t.stop = false
}

func (t *fakeTimer) fire(at time.Time) {
	t.ch <- at
}

// fakeClock is an injectable clock seam. now is read/written under a mutex so the scheduler
// goroutine and the test goroutine can race-detector-safely interact.
type fakeClock struct {
	mu     sync.Mutex
	now    time.Time
	timers []*fakeTimer
}

func newFakeClock(start time.Time) *fakeClock {
	return &fakeClock{now: start}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = t
}

func (c *fakeClock) NewTimer(d time.Duration) Timer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := newFakeTimer(d)
	c.timers = append(c.timers, timer)
	return timer
}

// lastTimer returns the most recently created timer, or nil.
func (c *fakeClock) lastTimer() *fakeTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.timers) == 0 {
		return nil
	}
	return c.timers[len(c.timers)-1]
}

func (c *fakeClock) timerCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.timers)
}

// fakeConfigStore is an in-memory ConfigReader/ConfigWriter fake (no SQLite dependency).
type fakeConfigStore struct {
	mu  sync.Mutex
	cfg download.ScheduleConfig
}

func (s *fakeConfigStore) GetScheduleConfig(_ context.Context) (download.ScheduleConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cfg, nil
}

func (s *fakeConfigStore) MarkScheduleRun(_ context.Context, lastAtMs int64, status string, nextAtMs int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.LastRunAtMs = lastAtMs
	s.cfg.LastRunStatus = status
	s.cfg.NextRunAtMs = nextAtMs
	return nil
}

// --- 5.1: enabled/disabled gating + next-boundary computation -------------------------------

// allWeekdaysMask mirrors design.md's all-days bitmask (bit0=Sunday..bit6=Saturday, 127 =
// 0b1111111) -- used throughout these tests to assert all-days parity with legacy behavior.
const allWeekdaysMask byte = 127

func TestNextDailyBoundaryAfterReturnsTodayWhenTimeNotYetPassed(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", allWeekdaysMask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := time.Date(2026, 6, 22, 14, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Fatalf("next boundary = %v, want %v", next, want)
	}
}

func TestNextDailyBoundaryAfterRollsToTomorrowWhenTimeAlreadyPassedToday(t *testing.T) {
	now := time.Date(2026, 6, 22, 15, 0, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", allWeekdaysMask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := time.Date(2026, 6, 23, 14, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Fatalf("next boundary = %v, want %v", next, want)
	}
}

func TestNextDailyBoundaryAfterIsExactlyNowRollsToTomorrow(t *testing.T) {
	now := time.Date(2026, 6, 22, 14, 30, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", allWeekdaysMask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := time.Date(2026, 6, 23, 14, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Fatalf("a boundary exactly equal to now must roll to tomorrow (next due tick), got %v want %v", next, want)
	}
}

func TestNextDailyBoundaryAfterRejectsMalformedHHMM(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	if _, err := nextDailyBoundaryAfter(now, "not-a-time", allWeekdaysMask, now.Location()); err == nil {
		t.Fatal("expected an error for a malformed HH:MM string, got nil")
	}
}

func TestNextDailyBoundaryAfterIsTimezoneSaneAcrossLocations(t *testing.T) {
	// A daily HH:MM boundary is interpreted in the GIVEN location consistently -- computing
	// the boundary in two different IANA zones for the "same" local wall-clock HH:MM must
	// NOT collapse to the same instant (each location's own midnight/offset applies).
	utc := time.Date(2026, 6, 22, 0, 0, 0, 0, time.UTC)

	tzNY, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable in this environment: %v", err)
	}

	nextUTC, err := nextDailyBoundaryAfter(utc, "09:00", allWeekdaysMask, time.UTC)
	if err != nil {
		t.Fatalf("unexpected error (UTC): %v", err)
	}
	nextNY, err := nextDailyBoundaryAfter(utc.In(tzNY), "09:00", allWeekdaysMask, tzNY)
	if err != nil {
		t.Fatalf("unexpected error (NY): %v", err)
	}

	if nextUTC.Equal(nextNY) {
		t.Fatalf("09:00 in UTC and 09:00 in America/New_York must be different instants, got both = %v", nextUTC)
	}
	if nextNY.Location().String() != tzNY.String() {
		t.Fatalf("boundary location = %v, want %v", nextNY.Location(), tzNY)
	}
}

// --- Weekday-mask cases (SDD download-schedule-weekdays) --------------------------------------

func TestNextDailyBoundaryAfterWeekdayMaskCases(t *testing.T) {
	// 2026-06-22 is a Monday (time.Weekday Monday=1); 2026-06-24 is Wednesday (3);
	// 2026-06-25 is Thursday (4).
	loc := time.UTC

	tests := []struct {
		name string
		now  time.Time
		hhmm string
		mask byte
		want time.Time
	}{
		{
			name: "today enabled and before configured time -> same-day candidate, zero advancement",
			now:  time.Date(2026, 6, 24, 8, 0, 0, 0, loc), // Wednesday
			hhmm: "14:30",
			mask: 1 << time.Wednesday,
			want: time.Date(2026, 6, 24, 14, 30, 0, 0, loc),
		},
		{
			name: "today disabled, next enabled day later in week -> advances day-by-day",
			now:  time.Date(2026, 6, 25, 8, 0, 0, 0, loc), // Thursday
			hhmm: "09:00",
			mask: 1 << time.Saturday,
			want: time.Date(2026, 6, 27, 9, 0, 0, 0, loc), // Saturday
		},
		{
			name: "wrap across week boundary: only Wednesday enabled, today Thursday -> next Wednesday",
			now:  time.Date(2026, 6, 25, 8, 0, 0, 0, loc), // Thursday
			hhmm: "09:00",
			mask: 1 << time.Wednesday,
			want: time.Date(2026, 7, 1, 9, 0, 0, 0, loc), // following Wednesday
		},
		{
			name: "all-7-bits mask -> identical fire timing to legacy daily behavior (today, before time)",
			now:  time.Date(2026, 6, 22, 8, 0, 0, 0, loc), // Monday
			hhmm: "09:00",
			mask: allWeekdaysMask,
			want: time.Date(2026, 6, 22, 9, 0, 0, 0, loc),
		},
		{
			name: "all-7-bits mask -> identical fire timing to legacy daily behavior (time already passed, rolls to tomorrow)",
			now:  time.Date(2026, 6, 22, 10, 0, 0, 0, loc), // Monday
			hhmm: "09:00",
			mask: allWeekdaysMask,
			want: time.Date(2026, 6, 23, 9, 0, 0, 0, loc),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := nextDailyBoundaryAfter(tc.now, tc.hhmm, tc.mask, loc)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !got.Equal(tc.want) {
				t.Fatalf("next boundary = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestNextDailyBoundaryAfterReturnsErrNoEnabledWeekdayForEmptyMask(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	_, err := nextDailyBoundaryAfter(now, "09:00", 0, now.Location())
	if !errors.Is(err, ErrNoEnabledWeekday) {
		t.Fatalf("expected ErrNoEnabledWeekday for an empty mask, got %v", err)
	}
}

func TestNextDailyBoundaryAfterAdvancementIsCappedAtSevenIterations(t *testing.T) {
	// A mask with exactly one bit set requires AT MOST 7 day-advancements to find it (it is
	// guaranteed to be found within a week) -- this exercises the boundary case at the cap
	// without ever exceeding it.
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC) // Monday, AFTER the target time
	mask := byte(1 << time.Monday)

	got, err := nextDailyBoundaryAfter(now, "09:00", mask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 6, 29, 9, 0, 0, 0, time.UTC) // next Monday, exactly 7 days later
	if !got.Equal(want) {
		t.Fatalf("next boundary = %v, want %v (advancement must be capped at 7 iterations)", got, want)
	}
}

func TestSchedulerDoesNotInvokeRunCallbackWhenScheduleDisabled(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false, DailyTimeHHMM: "10:00"}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	var calls int32
	var mu sync.Mutex
	run := func(_ context.Context, _ string) (string, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		return "ok", nil
	}

	sched := NewScheduler(Deps{
		Store: store,
		Clock: clock,
		Run:   run,
	})

	ctx, cancel := context.WithCancel(context.Background())
	sched.Start(ctx)

	// Drive at least one idle-poll iteration: disabled config must produce an idle timer, not
	// a due-boundary timer, and firing it must NEVER invoke run.
	waitForTimer(t, clock)
	clock.lastTimer().fire(clock.Now())

	waitForTimer(t, clock)
	cancel()
	sched.Stop()

	mu.Lock()
	defer mu.Unlock()
	if calls != 0 {
		t.Fatalf("run callback invoked %d times while schedule disabled, want 0", calls)
	}
}

// TestSchedulerNeverFiresWhenEnabledWeekdaysMaskIsEmpty asserts the loop() ErrNoEnabledWeekday
// path is handled identically to the existing !cfg.Enabled / parse-error idle-recheck path: an
// enabled schedule with an EMPTY weekday mask must idle-poll and NEVER invoke run (design.md
// "Empty Weekday Set Disables Scheduling"; SDD download-schedule-weekdays design "loop() ...
// on ErrNoEnabledWeekday it takes the SAME path as !cfg.Enabled / parse-error").
func TestSchedulerNeverFiresWhenEnabledWeekdaysMaskIsEmpty(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00", EnabledWeekdays: 0}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	var calls int32
	var mu sync.Mutex
	run := func(_ context.Context, _ string) (string, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		return "ok", nil
	}

	sched := NewScheduler(Deps{
		Store: store,
		Clock: clock,
		Run:   run,
	})

	ctx, cancel := context.WithCancel(context.Background())
	sched.Start(ctx)

	// Drive at least one idle-poll iteration: an empty weekday mask must produce an idle
	// timer (the ErrNoEnabledWeekday path), not a due-boundary timer, and firing it must NEVER
	// invoke run.
	waitForTimer(t, clock)
	clock.lastTimer().fire(clock.Now())

	waitForTimer(t, clock)
	cancel()
	sched.Stop()

	mu.Lock()
	defer mu.Unlock()
	if calls != 0 {
		t.Fatalf("run callback invoked %d times with an empty weekday mask, want 0", calls)
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
	clock.set(now.Add(time.Minute)) // advance to 10:00
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

// waitForTimer polls (real, short, bounded) until the fake clock has created at least one
// timer. This is necessary because Start() launches a goroutine and we must synchronize with
// it without sleeping on the FAKE clock (which only the scheduler advances logically).
func waitForTimer(t *testing.T, clock *fakeClock) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if clock.lastTimer() != nil {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("timed out waiting for scheduler to create a timer")
}

func waitForTimerCount(t *testing.T, clock *fakeClock, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if clock.timerCount() >= want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for scheduler to create timer #%d", want)
}

// --- 5.3: concurrent-run guard ----------------------------------------------------------------

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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()

	// First scheduled tick fires and blocks inside run (holds the guard).
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

	// A second scheduled tick (simulating the next day's boundary already computed) must be
	// SKIPPED, not queued/erred -- it must never reach run() while the guard is held.
	waitForTimer(t, clock)
	clock.set(clock.Now().Add(24 * time.Hour))
	clock.lastTimer().fire(clock.Now())

	select {
	case trigger := <-started:
		t.Fatalf("a second scheduled tick reached run() while a run was active (trigger=%q); it must be skipped", trigger)
	case <-time.After(200 * time.Millisecond):
		// expected: no second invocation
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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	go func() {
		_ = sched.TriggerNow(context.Background(), "manual")
	}()

	// Give the first TriggerNow a moment to actually acquire the guard before firing the
	// second one (bounded real-time wait is acceptable here -- it is not standing in for
	// scheduler *logic* time, only for goroutine scheduling).
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && !sched.Status(context.Background()).Running {
		time.Sleep(time.Millisecond)
	}
	if !sched.Status(context.Background()).Running {
		t.Fatal("timed out waiting for the first manual run to acquire the guard")
	}

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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
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

// --- 5.5/5.6: bounded Stop() drain + run max-duration guard -----------------------------------

func TestStopReturnsWithinDrainBoundEvenWithAnInFlightRun(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	runStarted := make(chan struct{})
	run := func(ctx context.Context, _ string) (string, error) {
		close(runStarted)
		<-ctx.Done() // honors cancellation -- never returns on its own in this test
		return "error", ctx.Err()
	}

	sched := NewScheduler(Deps{
		Store:             store,
		Clock:             clock,
		Run:               run,
		ShutdownDrainWait: 50 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
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
		<-ctx.Done() // simulates a wedged run; only the max-duration deadline unblocks it
		return "error", ctx.Err()
	}

	sched := NewScheduler(Deps{
		Store:          store,
		Clock:          clock,
		Run:            run,
		MaxRunDuration: 10 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sched.Start(ctx)
	defer sched.Stop()
	waitForTimer(t, clock)

	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("unexpected error starting the wedged run: %v", err)
	}

	// The run-level max-duration guard must release `running` on its own (real-time bound,
	// since it races a real context deadline set from a real wall-clock duration, not the
	// fake domain clock).
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && sched.Status(context.Background()).Running {
		time.Sleep(time.Millisecond)
	}
	if sched.Status(context.Background()).Running {
		t.Fatal("running guard was never released after the run exceeded MaxRunDuration")
	}

	// A subsequent trigger must succeed -- the guard is not held forever by the wedged run.
	if err := sched.TriggerNow(context.Background(), "manual"); err != nil {
		t.Fatalf("TriggerNow after guard release = %v, want nil (guard must not be held forever)", err)
	}
}

// --- 5.4 / accessors: next/last-run surfacing --------------------------------------------------

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
