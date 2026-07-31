// Package async provides shared coordination helpers for tests that observe
// background goroutines.
//
// The race detector is not available in this project: it needs a C toolchain
// on Windows, which the pure-Go modernc.org/sqlite driver exists to avoid.
// Concurrency tests here therefore assert logical invariants -- work is not
// lost, duplicated, or stranded -- instead of relying on -race to flag
// unsynchronized access. That is a deliberate trade with a real gap: these
// helpers cannot surface a data race, only its consequences.
//
// Eventually and AwaitState look similar and are not interchangeable:
//
//   - Eventually waits on real work (a queue drain, an I/O round trip) and
//     sleeps between checks, because polling faster would only burn CPU.
//   - AwaitState waits to observe a precise interleaving before acting on it,
//     and yields with runtime.Gosched instead of sleeping, because a sleep
//     would step straight over the window it exists to catch.
//
// Reach for AwaitState when the next statement depends on a goroutine having
// reached a specific state; reach for Eventually when only the outcome matters.
package async

import (
	"runtime"
	"time"
)

// DefaultTimeout bounds both helpers when no explicit timeout is supplied.
// It is generous on purpose: these helpers gate correctness assertions, so a
// slow machine should not turn a passing invariant into a spurious failure.
const DefaultTimeout = 2 * time.Second

// pollInterval is the gap between Eventually's condition checks. AwaitState
// deliberately does not use it -- see the package comment.
const pollInterval = time.Millisecond

// TestingT is the subset of *testing.T these helpers need. It is declared
// here rather than using testing.TB so the helpers' own failure paths can be
// exercised with a stub; testing.TB cannot be implemented outside the
// testing package.
type TestingT interface {
	Helper()
	Fatalf(format string, args ...any)
}

// Eventually blocks until condition reports true, failing the test with the
// supplied message if it has not within DefaultTimeout.
func Eventually(t TestingT, condition func() bool, format string, args ...any) {
	t.Helper()
	EventuallyWithin(t, DefaultTimeout, condition, format, args...)
}

// EventuallyWithin is Eventually with an explicit timeout, for the rare
// condition whose real-world latency does not fit the default.
func EventuallyWithin(t TestingT, timeout time.Duration, condition func() bool, format string, args ...any) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(pollInterval)
	}
	// Re-check once after the deadline: a condition that became true during
	// the final sleep is satisfied, not a failure.
	if condition() {
		return
	}
	t.Fatalf(format, args...)
}

// AwaitState spins until observe reports true, yielding the processor between
// checks so the caller can act at a precise point in another goroutine's
// progress. Use it to make an interleaving deterministic -- observe the state
// that opens the window, then act -- rather than sleeping and hoping.
//
// observe runs on the caller's goroutine and must read the state it inspects
// safely (under the same lock, or via an atomic) because it races with the
// goroutine it is watching.
func AwaitState(t TestingT, observe func() bool, format string, args ...any) {
	t.Helper()
	deadline := time.Now().Add(DefaultTimeout)
	for time.Now().Before(deadline) {
		if observe() {
			return
		}
		runtime.Gosched()
	}
	if observe() {
		return
	}
	t.Fatalf(format, args...)
}
