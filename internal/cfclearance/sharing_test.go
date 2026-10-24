package cfclearance

import (
	"errors"
	"net/http"
	"slices"
	"testing"
)

// Tests for the moments where two requests to one domain overlap: one is challenged while
// another is solving, has just solved, or has just thrown the stored clearance away. Each one
// is driven through a fake seam instead of scheduling luck.

func TestAChallengedRequestReusesTheSolveAlreadyInFlight(t *testing.T) {
	cases := []struct {
		name       string
		sharedErr  error
		wantStatus int
	}{
		{"the shared solve succeeds", nil, http.StatusOK},
		{"the shared solve fails", errors.New("engine unavailable"), http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(&fakeSolver{values: []string{"never"}}, Policy{}, "good")
			shared := &solveCall{done: make(chan struct{})}
			h.tr.inflight["jkanime.net"] = shared // another request is solving right now
			result := make(chan *http.Response, 1)
			go func() { result <- get(t, h.tr, siteURL) }()
			waitUntil(t, func() bool { return h.cf.hits() == 1 })

			if tc.sharedErr == nil {
				h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("good")})
			}
			shared.err = tc.sharedErr
			close(shared.done)

			assertStatusAndCalls(t, <-result, h.solver, tc.wantStatus, 0)
		})
	}
}

func TestAClearanceStoredMeanwhileIsReusedWithoutSolving(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"never"}}, Policy{}, "good")
	upstream := h.tr.base
	h.tr.base = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		resp, err := upstream.RoundTrip(req)
		if h.cf.hits() == 1 { // another request finished its solve while this one was in flight
			h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("good")})
		}
		return resp, err
	})

	resp := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, resp, h.solver, http.StatusOK, 0)
	if h.cf.hits() != 2 {
		t.Fatalf("hits = %d, want the challenge and one replay", h.cf.hits())
	}
}

// vanishingStore answers its second Load with nothing, as if another request had deleted the
// clearance between this request's decoration and its challenge handling.
type vanishingStore struct {
	*MemoryStore
	loads int
}

// Load hides the stored clearance on the second call only.
func (s *vanishingStore) Load(domain string) (Clearance, bool) {
	s.loads++
	if s.loads == 2 {
		return Clearance{}, false
	}
	return s.MemoryStore.Load(domain)
}

func TestAClearanceDeletedMeanwhileIsSolvedWithoutAWastedReplay(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"fresh"}}, Policy{}, "fresh")
	store := &vanishingStore{MemoryStore: NewMemoryStore()}
	store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("stale")})
	h.tr.store = store

	resp := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, resp, h.solver, http.StatusOK, 1)
	if h.cf.hits() != 2 || !slices.Equal(h.solver.rejected, []string{"stale"}) {
		t.Fatalf("hits=%d rejected=%q, want one challenge, one solve and one replay", h.cf.hits(), h.solver.rejected)
	}
}

func TestARejectedClearanceIsForgottenEvenWhenTheSolveFails(t *testing.T) {
	h := newHarness(&fakeSolver{err: errors.New("engine unavailable")}, Policy{}, "good")
	h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("old")})

	get(t, h.tr, siteURL)
	get(t, h.tr, siteURL)

	if _, ok := h.store.Load("jkanime.net"); ok || !slices.Equal(h.store.deletes, []string{"jkanime.net"}) {
		t.Fatalf("stored=%v deletes=%q, want the refused clearance gone", ok, h.store.deletes)
	}
	if _, err := h.cf.last().Cookie(clearanceCookie); err == nil {
		t.Fatal("the refused clearance was sent again")
	}
}

func TestASolverRepeatingTheRejectedValueIsRefused(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"stale"}}, Policy{}, "good")
	h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("stale")})

	resp := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, resp, h.solver, http.StatusForbidden, 1)
	failed := eventAt(t, h.bus, 1).(ClearanceFailedEvent)
	if failed.Reason != errNoFreshClearance.Error() || h.cf.hits() != 1 || len(h.store.saves) != 1 {
		t.Fatalf("reason=%q hits=%d saves=%d, want the repeat refused and never replayed", failed.Reason, h.cf.hits(), len(h.store.saves))
	}
}
