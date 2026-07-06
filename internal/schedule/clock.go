package schedule

import "time"

// realClock is the production Clock backed by the actual wall clock and time.Timer. Phase 6
// wires this into app.go's newScheduler seam; tests in this package use the fully fake Clock
// defined in scheduler_test.go instead.
type realClock struct{}

// NewRealClock returns the production Clock implementation.
func NewRealClock() Clock {
	return realClock{}
}

func (realClock) Now() time.Time { return time.Now() }

func (realClock) NewTimer(d time.Duration) Timer {
	return &realTimer{timer: time.NewTimer(d)}
}

type realTimer struct {
	timer *time.Timer
}

func (t *realTimer) C() <-chan time.Time { return t.timer.C }

func (t *realTimer) Stop() bool { return t.timer.Stop() }

func (t *realTimer) Reset(d time.Duration) {
	if !t.timer.Stop() {
		select {
		case <-t.timer.C:
		default:
		}
	}
	t.timer.Reset(d)
}

var _ Clock = realClock{}
var _ Timer = (*realTimer)(nil)
