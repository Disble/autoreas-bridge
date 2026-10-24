package cfclearance

import (
	"context"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"testing"
)

func TestUnchallengedRequestPassesThroughUntouched(t *testing.T) {
	h := newHarness(&fakeSolver{}, Policy{})
	h.cf.accepted[""] = true // an upstream that never challenges

	resp := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, resp, h.solver, http.StatusOK, 0)
	if body := readBody(t, resp); body != "site" {
		t.Fatalf("body = %q, want the upstream's bytes", body)
	}
	sent := h.cf.last()
	if ua := sent.Header.Get("User-Agent"); ua != adapterUA {
		t.Fatalf("User-Agent rewritten to %q", ua)
	}
	if len(sent.Cookies()) != 0 || len(h.bus.all()) != 0 {
		t.Fatalf("cookies=%v events=%v, want none", sent.Cookies(), h.bus.names())
	}
}

func TestChallengeIsSolvedOnceAndReplayedWithEngineIdentity(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{}, "good")

	first := get(t, h.tr, siteURL)
	later := get(t, h.tr, "https://cdn.jkanime.net/x.jpg")

	assertStatusAndCalls(t, later, h.solver, http.StatusOK, 1)
	if first.StatusCode != http.StatusOK || h.cf.hits() != 3 {
		t.Fatalf("first=%d hits=%d, want 200 and 3 (challenge, replay, reuse)", first.StatusCode, h.cf.hits())
	}
	last := h.cf.last()
	if ua := last.Header.Get("User-Agent"); ua != engineUA {
		t.Fatalf("User-Agent = %q, want the engine's", ua)
	}
	if !slices.Equal(h.solver.origins, []string{"https://jkanime.net"}) || h.cf.openChallenges() != 0 {
		t.Fatalf("origins=%q open challenge bodies=%d", h.solver.origins, h.cf.openChallenges())
	}
	var names []string
	for _, c := range last.Cookies() {
		names = append(names, c.Name)
	}
	if !slices.Equal(names, []string{clearanceCookie, "__cf_bm"}) {
		t.Fatalf("cookies replayed = %v, want only Cloudflare's own", names)
	}
}

func TestCallerCookieWinsOverStoredClearance(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{}, "good", "mine")
	get(t, h.tr, siteURL)

	req, _ := http.NewRequest(http.MethodGet, siteURL, nil)
	req.AddCookie(&http.Cookie{Name: clearanceCookie, Value: "mine"})
	if _, err := h.tr.RoundTrip(req); err != nil {
		t.Fatal(err)
	}

	got := h.cf.last().Cookies()
	if len(got) != 2 || got[0].Value != "mine" || got[1].Name != "__cf_bm" {
		t.Fatalf("cookies sent = %v, want the caller's cf_clearance plus __cf_bm", got)
	}
}

func TestStaleClearanceIsRejectedAndSolvedAgain(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"stale", "fresh"}}, Policy{}, "fresh")

	resp := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, resp, h.solver, http.StatusOK, 2)
	if !slices.Equal(h.solver.rejected, []string{"", "stale"}) {
		t.Fatalf("rejected = %q, want [\"\" \"stale\"]", h.solver.rejected)
	}
	if !slices.Equal(h.store.deletes, []string{"jkanime.net"}) {
		t.Fatalf("deletes = %q, want the stale clearance forgotten before the second solve", h.store.deletes)
	}
}

func TestSolvesPerRequestAreBounded(t *testing.T) {
	cases := []struct {
		name      string
		policy    Policy
		wantCalls int32
	}{
		{"default allows a stale and a fresh solve", Policy{}, 2},
		{"a single solve when the policy says so", Policy{MaxSolvesPerRequest: 1}, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(&fakeSolver{values: []string{"a", "b", "c"}}, tc.policy)

			resp := get(t, h.tr, siteURL)

			assertStatusAndCalls(t, resp, h.solver, http.StatusForbidden, tc.wantCalls)
			if h.cf.hits() != int(tc.wantCalls)+1 {
				t.Fatalf("hits = %d, want one more than the solves", h.cf.hits())
			}
		})
	}
}

func TestSolverResultIsRefusedWithoutIdentityOrFreshCookie(t *testing.T) {
	cases := []struct {
		name  string
		got   Clearance
		wantE error
	}{
		{"no User-Agent", Clearance{Cookies: engineCookies("good")}, errNoUserAgent},
		{"no cf_clearance", Clearance{UserAgent: engineUA, Cookies: engineCookies("good")[1:]}, errNoFreshClearance},
		{"empty cf_clearance", Clearance{UserAgent: engineUA, Cookies: engineCookies("")}, errNoFreshClearance},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(&fakeSolver{}, Policy{}, "good")
			h.tr.solver = solverFunc(func(context.Context, string, string) (Clearance, error) { return tc.got, nil })

			resp := get(t, h.tr, siteURL)

			if !IsChallenge(resp) || h.cf.hits() != 1 || len(h.store.saves) != 0 {
				t.Fatalf("status=%d hits=%d saves=%d: the result must not be replayed", resp.StatusCode, h.cf.hits(), len(h.store.saves))
			}
			failed := eventAt(t, h.bus, 1).(ClearanceFailedEvent)
			if failed.Reason != tc.wantE.Error() {
				t.Fatalf("reason = %q, want %q", failed.Reason, tc.wantE)
			}
		})
	}
}

func TestConcurrentChallengesShareOneSolve(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"good"}, gate: make(chan struct{})}, Policy{}, "good")

	var wg sync.WaitGroup
	codes := make([]int, 8)
	for i := range codes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i] = get(t, h.tr, siteURL).StatusCode
		}()
	}
	waitUntil(t, func() bool { return h.cf.hits() == len(codes) })
	close(h.solver.gate)
	wg.Wait()

	if n := h.solver.calls.Load(); n != 1 {
		t.Fatalf("solves = %d, want 1", n)
	}
	for i, c := range codes {
		if c != http.StatusOK {
			t.Fatalf("request %d status %d", i, c)
		}
	}
	if solved := slices.Index(h.bus.names(), EventNameClearanceSolved); solved < 0 || slices.Contains(h.bus.names()[solved+1:], EventNameClearanceSolved) {
		t.Fatalf("events = %v, want exactly one solved", h.bus.names())
	}
}

// oneShot builds a POST whose body cannot be rewound.
func oneShot() *http.Request {
	req, _ := http.NewRequest(http.MethodPost, siteURL+"ajax", io.NopCloser(strings.NewReader("q=1")))
	req.GetBody = nil
	return req
}

// bodiless builds a POST that declares no body at all.
func bodiless() *http.Request {
	req, _ := http.NewRequest(http.MethodPost, siteURL+"ajax", http.NoBody)
	req.GetBody = nil
	return req
}

// rewindable builds a POST whose body net/http can replay.
func rewindable() *http.Request {
	req, _ := http.NewRequest(http.MethodPost, siteURL+"ajax", strings.NewReader("q=1"))
	return req
}

func TestBodiesAreReplayedOnlyWhenRewindable(t *testing.T) {
	cases := []struct {
		name       string
		req        *http.Request
		wantStatus int
		wantBodies []string
	}{
		{"rewindable body is sent again", rewindable(), http.StatusOK, []string{"q=1", "q=1"}},
		{"one-shot body is never retried", oneShot(), http.StatusForbidden, []string{"q=1"}},
		{"declared empty body is sent again", bodiless(), http.StatusOK, []string{"", ""}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{}, "good")

			resp, err := h.tr.RoundTrip(tc.req)

			if err != nil || resp.StatusCode != tc.wantStatus || !slices.Equal(h.cf.bodies, tc.wantBodies) {
				t.Fatalf("status=%d err=%v bodies=%q, want %d %q", resp.StatusCode, err, h.cf.bodies, tc.wantStatus, tc.wantBodies)
			}
			if solves := int(h.solver.calls.Load()); solves != len(tc.wantBodies)-1 {
				t.Fatalf("solves = %d, want %d", solves, len(tc.wantBodies)-1)
			}
		})
	}
}

func TestBodyRewindFailureSurfaces(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{}, "good")
	req, _ := http.NewRequest(http.MethodPost, siteURL+"ajax", strings.NewReader("q=1"))
	boom := errors.New("body gone")
	req.GetBody = func() (io.ReadCloser, error) { return nil, boom }

	resp, err := h.tr.RoundTrip(req)

	if !errors.Is(err, boom) || resp != nil || h.solver.calls.Load() != 1 {
		t.Fatalf("resp=%v err=%v solves=%d, want the rewind error after one solve", resp, err, h.solver.calls.Load())
	}
}

func TestUpstreamErrorIsReturnedUnchanged(t *testing.T) {
	boom := errors.New("dial tcp: refused")
	h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{})
	h.tr.base = roundTripFunc(func(*http.Request) (*http.Response, error) { return nil, boom })

	req, _ := http.NewRequest(http.MethodGet, siteURL, nil)
	resp, err := h.tr.RoundTrip(req)

	if !errors.Is(err, boom) || resp != nil || h.solver.calls.Load() != 0 {
		t.Fatalf("resp=%v err=%v solves=%d", resp, err, h.solver.calls.Load())
	}
}

func TestStoredCookiesAreMatchedToTheRequestURL(t *testing.T) {
	cases := []struct {
		name   string
		domain string
		path   string
		url    string
		sent   bool
	}{
		{"domain cookie on its apex", ".jkanime.net", "/", "https://jkanime.net/", true},
		{"domain cookie on a subdomain", ".jkanime.net", "/", "https://cdn.jkanime.net/x.jpg", true},
		{"dotless domain still covers subdomains", "jkanime.net", "/", "https://cdn.jkanime.net/", true},
		{"cookie domain in any casing", ".JKAnime.NET", "/", "https://jkanime.net/", true},
		{"subdomain cookie stays off the apex", "cdn.jkanime.net", "/", "https://jkanime.net/", false},
		{"subdomain cookie on itself", "cdn.jkanime.net", "/", "https://cdn.jkanime.net/", true},
		{"subdomain cookie below itself", "cdn.jkanime.net", "/", "https://www.cdn.jkanime.net/", true},
		{"a suffix without a label boundary is another host", "dn.jkanime.net", "/", "https://cdn.jkanime.net/", false},
		{"path cookie on its path", ".jkanime.net", "/ajax", "https://jkanime.net/ajax", true},
		{"path cookie below its path", ".jkanime.net", "/ajax", "https://jkanime.net/ajax/x", true},
		{"path cookie off a longer sibling", ".jkanime.net", "/ajax", "https://jkanime.net/ajaxy", false},
		{"path cookie off the root", ".jkanime.net", "/ajax", "https://jkanime.net/", false},
		{"slash-terminated path below itself", ".jkanime.net", "/ajax/", "https://jkanime.net/ajax/x", true},
		{"slash-terminated path off its parent", ".jkanime.net", "/ajax/", "https://jkanime.net/ajax", false},
		{"empty path means the root", ".jkanime.net", "", "https://jkanime.net/anything", true},
		{"empty request path is the root", ".jkanime.net", "/", "https://jkanime.net", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(&fakeSolver{err: errors.New("no engine")}, Policy{}, "good")
			h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: []*http.Cookie{
				{Name: clearanceCookie, Value: "good", Domain: tc.domain, Path: tc.path},
			}})

			get(t, h.tr, tc.url)

			if _, err := h.cf.seen[0].Cookie(clearanceCookie); (err == nil) != tc.sent {
				t.Fatalf("cookie sent = %v, want %v", err == nil, tc.sent)
			}
		})
	}
}

func TestEngineCookieWithoutDomainIsScopedToTheSolvedHost(t *testing.T) {
	cases := []struct {
		name      string
		solvedAt  string
		then      string
		wantCalls int32
	}{
		{"solved on the apex covers a subdomain", "https://jkanime.net/", "https://cdn.jkanime.net/", 1},
		{"solved on a subdomain stays off the apex", "https://cdn.jkanime.net/", "https://jkanime.net/", 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			solver := &fakeSolver{values: []string{"good", "good"}, cookies: bareCookies}
			h := newHarness(solver, Policy{}, "good")

			get(t, h.tr, tc.solvedAt)
			resp := get(t, h.tr, tc.then)

			assertStatusAndCalls(t, resp, h.solver, http.StatusOK, tc.wantCalls)
		})
	}
}

func TestEmptyStoredUserAgentKeepsTheCallersIdentity(t *testing.T) {
	h := newHarness(&fakeSolver{}, Policy{}, "good")
	h.store.Save("jkanime.net", Clearance{Cookies: engineCookies("good")[:1]})

	resp := get(t, h.tr, siteURL)

	assertStatusAndCalls(t, resp, h.solver, http.StatusOK, 0)
	if ua := h.cf.last().Header.Get("User-Agent"); ua != adapterUA {
		t.Fatalf("User-Agent = %q, want the adapter's own", ua)
	}
}
