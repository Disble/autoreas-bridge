package schedule

import (
	"context"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download"

	"autoreas-bridge/internal/testsupport/async"
)

// fakeTimer is a controllable timer the test drives manually via fire(). It satisfies the
// schedule.Timer seam (C()/Stop()/Reset()).
type fakeTimer struct {
	mu   sync.Mutex
	ch   chan time.Time
	dur  time.Duration
	stop bool
}

// newFakeTimer creates a controllable timer for scheduler tests.
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

// fire delivers a timer event at the requested time.
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

// newFakeClock creates a controllable clock for scheduler tests.
func newFakeClock(start time.Time) *fakeClock {
	return &fakeClock{now: start}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

// set moves the fake clock to t.
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

// timerCount returns the number of timers created by the fake clock.
func (c *fakeClock) timerCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.timers)
}

// fakeConfigStore is an in-memory ConfigReader/ConfigWriter fake (no SQLite dependency).
type fakeConfigStore struct {
	mu                 sync.Mutex
	cfg                download.ScheduleConfig
	settlementRequests []download.ScheduleSettlementRequest
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

func (s *fakeConfigStore) ApplyScheduleSettlement(_ context.Context, req download.ScheduleSettlementRequest) (download.ScheduleSettlementResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settlementRequests = append(s.settlementRequests, req)
	if s.cfg.LastSettledLocalDate > req.LocalDate {
		return download.ScheduleSettlementResult{Outcome: download.ScheduleSettlementObsolete}, nil
	}
	if s.cfg.LastSettledLocalDate == req.LocalDate {
		return download.ScheduleSettlementResult{Outcome: download.ScheduleSettlementIdempotent}, nil
	}
	s.cfg.LastSettledLocalDate = req.LocalDate
	s.cfg.LastSettlementReason = req.Reason
	s.cfg.NextRunAtMs = req.NextRunAtMs
	s.cfg.LastMissedAttemptDate = ""
	s.cfg.LastMissedAttemptStatus = ""
	if req.SuccessfulRunAtMs != nil {
		s.cfg.LastRunAtMs = *req.SuccessfulRunAtMs
	}
	if req.SuccessfulStatus != "" {
		s.cfg.LastRunStatus = req.SuccessfulStatus
	}
	return download.ScheduleSettlementResult{Outcome: download.ScheduleSettlementApplied}, nil
}

func (s *fakeConfigStore) RecordMissedStartupAttempt(_ context.Context, localDate string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.LastMissedAttemptDate = localDate
	s.cfg.LastMissedAttemptStatus = status
	return nil
}

// allWeekdaysMask mirrors design.md's all-days bitmask (bit0=Sunday..bit6=Saturday, 127 =
// 0b1111111) -- used throughout these tests to assert all-days parity with legacy behavior.
const allWeekdaysMask byte = 127

// waitForTimer polls (real, short, bounded) until the fake clock has created at least one
// timer. This is necessary because Start() launches a goroutine and we must synchronize with
// it without sleeping on the FAKE clock (which only the scheduler advances logically).
func waitForTimer(t *testing.T, clock *fakeClock) {
	t.Helper()
	async.Eventually(t, func() bool { return clock.lastTimer() != nil },
		"timed out waiting for scheduler to create a timer")
}

// waitForTimerCount waits until the fake clock creates the expected timers.
func waitForTimerCount(t *testing.T, clock *fakeClock, want int) {
	t.Helper()
	async.Eventually(t, func() bool { return clock.timerCount() >= want },
		"timed out waiting for scheduler to create timer #%d", want)
}
