// Package schedule tests for the in-process scheduler (design.md §3.5/§6). All tests use an
// INJECTED fake clock (no real sleeping) and an injected run-callback seam, per design.md §3.9
// "every dependency is an interface" discipline and the PR4a brief's explicit ban on real time.
package schedule

import (
	"context"
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

// allWeekdaysMask mirrors design.md's all-days bitmask (bit0=Sunday..bit6=Saturday, 127 =
// 0b1111111) -- used throughout these tests to assert all-days parity with legacy behavior.
const allWeekdaysMask byte = 127

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
