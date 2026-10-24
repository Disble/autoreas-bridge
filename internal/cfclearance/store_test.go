package cfclearance

import (
	"context"
	"errors"
	"net/http"
	"testing"
)

func TestMemoryStoreKeepsOneClearancePerDomain(t *testing.T) {
	s := NewMemoryStore()
	first := Clearance{UserAgent: "ua-1", Cookies: engineCookies("one")}
	second := Clearance{UserAgent: "ua-2", Cookies: engineCookies("two")}

	if _, ok := s.Load("jkanime.net"); ok {
		t.Fatal("an empty store must not answer")
	}
	s.Save("jkanime.net", first)
	s.Save("other.net", second)
	s.Save("jkanime.net", second)
	got, ok := s.Load("jkanime.net")
	if !ok || got.UserAgent != "ua-2" || got.Cookies[0].Value != "two" {
		t.Fatalf("Load = %+v %v, want the latest save", got, ok)
	}
	s.Delete("jkanime.net")
	if _, ok := s.Load("jkanime.net"); ok {
		t.Fatal("a deleted domain must not answer")
	}
	if other, ok := s.Load("other.net"); !ok || other.UserAgent != "ua-2" {
		t.Fatalf("other domain = %+v %v, want untouched", other, ok)
	}
}

func TestUnsupportedSolverRefusesEverySolve(t *testing.T) {
	got, err := UnsupportedSolver{}.Solve(context.Background(), siteURL, "")

	if !errors.Is(err, ErrUnsupported) || got.UserAgent != "" || len(got.Cookies) != 0 {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestMissingStoreAndPublisherStillClearAChallenge(t *testing.T) {
	cf := &fakeCloudflare{accepted: map[string]bool{"good": true}}
	solver := &fakeSolver{values: []string{"good"}}
	tr := NewTransport(cf, solver, nil, nil, newTestLog(), Policy{})

	get(t, tr, siteURL)
	resp := get(t, tr, siteURL)

	assertStatusAndCalls(t, resp, solver, http.StatusOK, 1)
}

func TestNewTransportFillsEveryMissingDependency(t *testing.T) {
	tr := NewTransport(nil, nil, nil, nil, newTestLog(), Policy{})

	if tr.base != http.DefaultTransport || tr.store == nil || tr.publisher == nil || tr.solver == nil {
		t.Fatalf("transport = %+v, want every dependency defaulted", tr)
	}
	if tr.policy.Cooldown != DefaultCooldown || cap(tr.slots) != DefaultMaxConcurrentSolves {
		t.Fatalf("policy=%+v slots=%d", tr.policy, cap(tr.slots))
	}
}
