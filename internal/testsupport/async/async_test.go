package async

import (
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

// recordingT captures Fatalf instead of aborting, so the helpers' own failure
// paths are assertable. Fatalf on a real *testing.T never returns; the
// helpers must therefore not depend on control flow after calling it.
type recordingT struct {
	failed  bool
	message string
}

func (r *recordingT) Helper() {}

func (r *recordingT) Fatalf(format string, args ...any) {
	r.failed = true
	r.message = fmt.Sprintf(format, args...)
}

// TestEventuallyReturnsOnceConditionHolds asserts the happy path returns
// without failing the test.
func TestEventuallyReturnsOnceConditionHolds(t *testing.T) {
	t.Parallel()

	var flag atomic.Bool
	go func() {
		time.Sleep(5 * time.Millisecond)
		flag.Store(true)
	}()

	recorder := &recordingT{}
	Eventually(recorder, flag.Load, "flag never set")

	if recorder.failed {
		t.Fatalf("expected Eventually to succeed, got failure %q", recorder.message)
	}
}

// TestEventuallyWithinFailsWithFormattedMessageOnTimeout asserts the timeout
// path reports the caller's message, formatted with its arguments.
func TestEventuallyWithinFailsWithFormattedMessageOnTimeout(t *testing.T) {
	t.Parallel()

	recorder := &recordingT{}
	EventuallyWithin(recorder, 10*time.Millisecond, func() bool { return false }, "want %d records", 3)

	if !recorder.failed {
		t.Fatal("expected EventuallyWithin to fail when the condition never holds")
	}
	if recorder.message != "want 3 records" {
		t.Fatalf("expected the caller's formatted message, got %q", recorder.message)
	}
}

// TestEventuallyWithinAcceptsConditionSatisfiedDuringFinalSleep asserts the
// post-deadline re-check: a condition that flips during the last poll gap is
// satisfied, not a flake. Without the re-check this is exactly the race that
// makes polling helpers intermittently fail on loaded machines.
func TestEventuallyWithinAcceptsConditionSatisfiedDuringFinalSleep(t *testing.T) {
	t.Parallel()

	calls := 0
	condition := func() bool {
		calls++
		// False for every in-loop check, true only once the loop has
		// exhausted its deadline and performs the final re-check.
		return calls > 1
	}

	recorder := &recordingT{}
	EventuallyWithin(recorder, time.Nanosecond, condition, "should not fail")

	if recorder.failed {
		t.Fatalf("expected the post-deadline re-check to accept a late condition, got %q", recorder.message)
	}
}

// TestAwaitStateReturnsOnceStateObserved asserts AwaitState releases as soon
// as the watched state is reached.
func TestAwaitStateReturnsOnceStateObserved(t *testing.T) {
	t.Parallel()

	var reached atomic.Bool
	go func() { reached.Store(true) }()

	recorder := &recordingT{}
	AwaitState(recorder, reached.Load, "state never reached")

	if recorder.failed {
		t.Fatalf("expected AwaitState to observe the state, got %q", recorder.message)
	}
}

// TestAwaitStateFailsWhenStateNeverReached asserts AwaitState is bounded: a
// state that never arrives fails the test rather than hanging the suite.
func TestAwaitStateFailsWhenStateNeverReached(t *testing.T) {
	t.Parallel()

	const timeout = 20 * time.Millisecond
	recorder := &recordingT{}
	start := time.Now()
	awaitStateWithin(recorder, timeout, func() bool { return false }, "state %q never reached", "bound")

	if !recorder.failed {
		t.Fatal("expected AwaitState to fail when the state never arrives")
	}
	if recorder.message != `state "bound" never reached` {
		t.Fatalf("expected the caller's formatted message, got %q", recorder.message)
	}
	if elapsed := time.Since(start); elapsed < timeout || elapsed > DefaultTimeout {
		t.Fatalf("expected AwaitState to give up at its %s timeout, took %s", timeout, elapsed)
	}
}

// TestAwaitStateGivesUpAtDefaultTimeout asserts AwaitState itself is bounded by
// DefaultTimeout: a state that never arrives fails after DefaultTimeout and
// well before twice it. The test stops waiting at twice DefaultTimeout, so a
// longer bound fails here instead of hanging the suite.
func TestAwaitStateGivesUpAtDefaultTimeout(t *testing.T) {
	t.Parallel()

	recorder := &recordingT{}
	done := make(chan struct{})
	start := time.Now()
	go func() {
		defer close(done)
		AwaitState(recorder, func() bool { return false }, "state never reached")
	}()

	select {
	case <-done:
	case <-time.After(2 * DefaultTimeout):
		t.Fatalf("expected AwaitState to give up within %s", 2*DefaultTimeout)
	}
	if elapsed := time.Since(start); !recorder.failed || elapsed < DefaultTimeout {
		t.Fatalf("expected AwaitState to fail after waiting %s, failed=%t after %s", DefaultTimeout, recorder.failed, elapsed)
	}
}

// TestAwaitStateWaitsBeyondAShortDelay asserts AwaitState keeps its generous
// DefaultTimeout: a state that arrives after a short delay is still observed.
func TestAwaitStateWaitsBeyondAShortDelay(t *testing.T) {
	t.Parallel()

	var reached atomic.Bool
	time.AfterFunc(50*time.Millisecond, func() { reached.Store(true) })

	recorder := &recordingT{}
	AwaitState(recorder, reached.Load, "state never reached")

	if recorder.failed {
		t.Fatalf("expected AwaitState to wait for a late state, got %q", recorder.message)
	}
}
