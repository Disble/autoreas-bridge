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

func TestNextDailyBoundaryAfterReturnsTodayWhenTimeNotYetPassed(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", now.Location())
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

	next, err := nextDailyBoundaryAfter(now, "14:30", now.Location())
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

	next, err := nextDailyBoundaryAfter(now, "14:30", now.Location())
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

	if _, err := nextDailyBoundaryAfter(now, "not-a-time", now.Location()); err == nil {
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

	nextUTC, err := nextDailyBoundaryAfter(utc, "09:00", time.UTC)
	if err != nil {
		t.Fatalf("unexpected error (UTC): %v", err)
	}
	nextNY, err := nextDailyBoundaryAfter(utc.In(tzNY), "09:00", tzNY)
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

func TestSchedulerDoesNotInvokeRunCallbackWhenScheduleDisabled(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false, DailyTimeHHMM: "10:00"}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	var calls int32
	var mu sync.Mutex
	run := func(_ context.Context, _ string) error {
		mu.Lock()
		calls++
		mu.Unlock()
		return nil
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

func TestSchedulerInvokesRunCallbackWithScheduledTriggerWhenDue(t *testing.T) {
	now := time.Date(2026, 6, 22, 9, 59, 0, 0, time.UTC)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00"}}
	clock := newFakeClock(now)

	called := make(chan string, 1)
	run := func(_ context.Context, trigger string) error {
		called <- trigger
		return nil
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

// --- 5.3: concurrent-run guard ----------------------------------------------------------------

func TestScheduledTickDuringActiveRunIsSkippedSilently(t *testing.T) {
	now := time.Date(2026, 6, 22, 9, 59, 0, 0, time.UTC)
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "10:00"}}
	clock := newFakeClock(now)

	release := make(chan struct{})
	started := make(chan string, 4)
	run := func(ctx context.Context, trigger string) error {
		started <- trigger
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil
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
	run := func(ctx context.Context, _ string) error {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil
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

// --- 5.5/5.6: bounded Stop() drain + run max-duration guard -----------------------------------

func TestStopReturnsWithinDrainBoundEvenWithAnInFlightRun(t *testing.T) {
	store := &fakeConfigStore{cfg: download.ScheduleConfig{Enabled: false}}
	clock := newFakeClock(time.Date(2026, 6, 22, 9, 0, 0, 0, time.UTC))

	runStarted := make(chan struct{})
	run := func(ctx context.Context, _ string) error {
		close(runStarted)
		<-ctx.Done() // honors cancellation -- never returns on its own in this test
		return ctx.Err()
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

	run := func(ctx context.Context, _ string) error {
		<-ctx.Done() // simulates a wedged run; only the max-duration deadline unblocks it
		return ctx.Err()
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

	sched := NewScheduler(Deps{Store: store, Clock: clock, Run: func(context.Context, string) error { return nil }})

	status := sched.Status(context.Background())
	if status.LastRunAtMs != 1000 || status.LastRunStatus != "ok" || status.NextRunAtMs != 2000 {
		t.Fatalf("Status() = %+v, want it to mirror the persisted ScheduleConfig", status)
	}
}
