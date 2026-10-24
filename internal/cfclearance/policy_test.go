package cfclearance

import (
	"net/http"
	"testing"
	"time"
)

func TestZeroPolicyMeansEveryDefault(t *testing.T) {
	got := Policy{}.withDefaults()

	if got.SolveTimeout != 30*time.Second || got.MaxSolvesPerRequest != 2 || got.Cooldown != 10*time.Minute || got.MaxConcurrentSolves != 1 {
		t.Fatalf("defaults = %+v", got)
	}
	if got.Eligible == nil || !got.Eligible("any.host") {
		t.Fatal("the default policy must admit every host")
	}
}

func TestExplicitPolicyValuesAreKept(t *testing.T) {
	set := Policy{
		Eligible:            func(h string) bool { return h == "only.net" },
		SolveTimeout:        time.Second,
		MaxSolvesPerRequest: 5,
		Cooldown:            time.Minute,
		MaxConcurrentSolves: 3,
	}

	got := set.withDefaults()

	if got.SolveTimeout != time.Second || got.MaxSolvesPerRequest != 5 || got.Cooldown != time.Minute || got.MaxConcurrentSolves != 3 {
		t.Fatalf("got %+v, want every explicit value kept", got)
	}
	if got.Eligible("any.host") || !got.Eligible("only.net") {
		t.Fatal("the explicit eligibility must be kept")
	}
}

func TestIneligibleRequestsPassThroughUntouched(t *testing.T) {
	cases := []struct {
		name    string
		policy  Policy
		url     string
		handled bool
	}{
		{"HTTPS host under the default policy", Policy{}, "https://jkanime.net/", true},
		{"plain HTTP is never handled", Policy{}, "http://jkanime.net/", false},
		{"host the policy admits", Policy{Eligible: func(h string) bool { return h == "jkanime.net" }}, "https://jkanime.net/", true},
		{"host the policy excludes", Policy{Eligible: func(h string) bool { return h == "other.net" }}, "https://jkanime.net/", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(&fakeSolver{values: []string{"good"}}, tc.policy, "good")
			h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("good")})

			resp := get(t, h.tr, tc.url)

			if tc.handled {
				assertStatusAndCalls(t, resp, h.solver, http.StatusOK, 0)
				return
			}
			assertStatusAndCalls(t, resp, h.solver, http.StatusForbidden, 0)
			sent := h.cf.last()
			if len(sent.Cookies()) != 0 || sent.Header.Get("User-Agent") != adapterUA || len(h.bus.all()) != 0 {
				t.Fatalf("cookies=%v ua=%q events=%v, want the request untouched", sent.Cookies(), sent.Header.Get("User-Agent"), h.bus.names())
			}
		})
	}
}
