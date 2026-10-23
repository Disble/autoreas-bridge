package cfclearance

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"testing"
	"time"
)

func TestFailedSolveOpensACooldownForTheDomain(t *testing.T) {
	h := newHarness(&fakeSolver{err: errors.New("engine unavailable")}, Policy{}, "good")

	first := get(t, h.tr, siteURL)
	during := get(t, h.tr, siteURL)
	h.clock.Advance(DefaultCooldown - time.Nanosecond)
	stillCooling := get(t, h.tr, siteURL)
	h.clock.Advance(time.Nanosecond)
	after := get(t, h.tr, siteURL)

	for i, resp := range []*http.Response{first, during, stillCooling, after} {
		if !IsChallenge(resp) {
			t.Fatalf("response %d status %d, want the challenge", i, resp.StatusCode)
		}
	}
	if n := h.solver.calls.Load(); n != 2 {
		t.Fatalf("solves = %d, want one before and one after the cooldown", n)
	}
	want := []string{
		EventNameChallengeDetected, EventNameClearanceFailed,
		EventNameChallengeDetected,
		EventNameChallengeDetected,
		EventNameChallengeDetected, EventNameClearanceFailed,
	}
	if !slices.Equal(h.bus.names(), want) {
		t.Fatalf("events = %v, want %v", h.bus.names(), want)
	}
}

func TestCooldownIsPerDomain(t *testing.T) {
	h := newHarness(&fakeSolver{err: errors.New("engine unavailable")}, Policy{}, "good")

	get(t, h.tr, siteURL)
	get(t, h.tr, "https://other.net/")

	if n := h.solver.calls.Load(); n != 2 {
		t.Fatalf("solves = %d, want the other domain solved on its own", n)
	}
}

func TestCooldownLengthFollowsThePolicy(t *testing.T) {
	h := newHarness(&fakeSolver{err: errors.New("engine unavailable")}, Policy{Cooldown: time.Minute}, "good")

	get(t, h.tr, siteURL)
	h.clock.Advance(time.Minute)
	get(t, h.tr, siteURL)

	if n := h.solver.calls.Load(); n != 2 {
		t.Fatalf("solves = %d, want a second solve once the configured minute passed", n)
	}
}

func TestSolveWaitsForAFreeSlotAndTimesOut(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{SolveTimeout: 20 * time.Millisecond}, "good")
	h.tr.slots <- struct{}{} // the only engine slot is busy elsewhere

	resp := get(t, h.tr, siteURL)
	<-h.tr.slots
	later := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, later, h.solver, http.StatusForbidden, 0)
	if !IsChallenge(resp) {
		t.Fatalf("status = %d, want the challenge while no slot frees up", resp.StatusCode)
	}
	failed := eventAt(t, h.bus, 1).(ClearanceFailedEvent)
	if failed.Reason != context.DeadlineExceeded.Error() {
		t.Fatalf("reason = %q, want the timeout", failed.Reason)
	}
}

func TestSolverSlotsFollowThePolicy(t *testing.T) {
	solver := &fakeSolver{values: []string{"good", "good"}, gate: make(chan struct{}), cookies: bareCookies}
	h := newHarness(solver, Policy{MaxConcurrentSolves: 2}, "good")

	done := make(chan int, 2)
	for _, u := range []string{siteURL, "https://other.net/"} {
		go func() { done <- get(t, h.tr, u).StatusCode }()
	}
	waitUntil(t, func() bool { return solver.calls.Load() == 2 })
	close(solver.gate)

	if a, b := <-done, <-done; a != http.StatusOK || b != http.StatusOK {
		t.Fatalf("statuses %d %d", a, b)
	}
}

func TestWithoutASolverTheChallengeIsAnsweredAsIs(t *testing.T) {
	h := newHarness(&fakeSolver{}, Policy{}, "good")
	h.tr = NewTransport(h.cf, nil, h.store, h.bus, Policy{})

	resp := get(t, h.tr, siteURL)

	if !IsChallenge(resp) || h.cf.hits() != 1 {
		t.Fatalf("status=%d hits=%d", resp.StatusCode, h.cf.hits())
	}
	failed := eventAt(t, h.bus, 1).(ClearanceFailedEvent)
	if failed.Reason != ErrUnsupported.Error() {
		t.Fatalf("reason = %q, want %q", failed.Reason, ErrUnsupported)
	}
}

func TestAWaiterGivingUpKeepsTheSharedSolveAlive(t *testing.T) {
	solver := &fakeSolver{values: []string{"good"}, gate: make(chan struct{})}
	h := newHarness(solver, Policy{}, "good")
	leader := make(chan int, 1)
	go func() { leader <- get(t, h.tr, siteURL).StatusCode }()
	waitUntil(t, func() bool { return solver.calls.Load() == 1 })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, siteURL, nil)
	resp, err := h.tr.RoundTrip(req)
	close(solver.gate)

	if err != nil || !IsChallenge(resp) {
		t.Fatalf("resp=%v err=%v, want the challenge for the waiter that gave up", resp, err)
	}
	if code := <-leader; code != http.StatusOK {
		t.Fatalf("leader status %d, want its solve unaffected", code)
	}
}
