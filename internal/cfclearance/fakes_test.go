package cfclearance

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// engineUA is the identity the fake engine earns its clearances with.
const engineUA = "Mozilla/5.0 Edg/155.0.0.0"

// adapterUA is the identity a provider adapter sends on its own.
const adapterUA = "adapter-ua"

// siteURL is the origin every test challenges unless it says otherwise.
const siteURL = "https://jkanime.net/"

// fakeCloudflare challenges every request whose cf_clearance is not in accepted and records
// what reached it.
type fakeCloudflare struct {
	mu         sync.Mutex
	accepted   map[string]bool
	seen       []*http.Request
	bodies     []string
	challenges []*spyBody
}

// RoundTrip answers 200 to an accepted clearance and a header challenge to anything else.
func (f *fakeCloudflare) RoundTrip(req *http.Request) (*http.Response, error) {
	body := ""
	if req.Body != nil {
		b, _ := io.ReadAll(req.Body)
		body = string(b)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seen = append(f.seen, req)
	f.bodies = append(f.bodies, body)
	value := ""
	if c, err := req.Cookie(clearanceCookie); err == nil {
		value = c.Value
	}
	if f.accepted[value] {
		return respond(http.StatusOK, nil, "site"), nil
	}
	challenge := respond(http.StatusForbidden, http.Header{"Cf-Mitigated": {"challenge"}}, "blocked")
	spy := &spyBody{Reader: challenge.Body}
	challenge.Body = spy
	f.challenges = append(f.challenges, spy)
	return challenge, nil
}

// openChallenges counts challenge responses whose body was never closed.
func (f *fakeCloudflare) openChallenges() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	open := 0
	for _, b := range f.challenges {
		if !b.closed {
			open++
		}
	}
	return open
}

// hits returns how many requests reached the fake upstream.
func (f *fakeCloudflare) hits() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.seen)
}

// last returns the most recent request the fake upstream saw.
func (f *fakeCloudflare) last() *http.Request {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.seen[len(f.seen)-1]
}

// spyBody records how often it is read and whether it was closed.
type spyBody struct {
	io.Reader
	reads  int
	closed bool
}

// Read counts the call and delegates.
func (s *spyBody) Read(p []byte) (int, error) {
	s.reads++
	return s.Reader.Read(p)
}

// Close marks the body closed.
func (s *spyBody) Close() error {
	s.closed = true
	return nil
}

// respond builds a canned upstream response.
func respond(code int, h http.Header, body string) *http.Response {
	if h == nil {
		h = http.Header{}
	}
	return &http.Response{StatusCode: code, Header: h, Body: io.NopCloser(strings.NewReader(body))}
}

// fakeSolver hands out cf_clearance values in order and records what it was asked.
type fakeSolver struct {
	mu       sync.Mutex
	values   []string
	err      error
	rejected []string
	origins  []string
	calls    atomic.Int32
	gate     chan struct{}
	cookies  func(value string) []*http.Cookie
}

// Solve yields the next value, waiting on gate first when one is set.
func (s *fakeSolver) Solve(ctx context.Context, origin, rejected string) (Clearance, error) {
	s.calls.Add(1)
	if s.gate != nil {
		select {
		case <-s.gate:
		case <-ctx.Done():
			return Clearance{}, ctx.Err()
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rejected = append(s.rejected, rejected)
	s.origins = append(s.origins, origin)
	if s.err != nil {
		return Clearance{}, s.err
	}
	if len(s.values) == 0 {
		return Clearance{}, errors.New("fakeSolver: asked for more clearances than it was given")
	}
	v := s.values[0]
	s.values = s.values[1:]
	if s.cookies != nil {
		return Clearance{UserAgent: engineUA, Cookies: s.cookies(v)}, nil
	}
	return Clearance{UserAgent: engineUA, Cookies: engineCookies(v)}, nil
}

// engineCookies is what a real engine hands back: the clearance, a Cloudflare helper cookie
// and the site's own session cookie.
func engineCookies(value string) []*http.Cookie {
	return []*http.Cookie{
		{Name: clearanceCookie, Value: value, Domain: ".jkanime.net", Path: "/"},
		{Name: "__cf_bm", Value: "bm-" + value, Domain: ".jkanime.net", Path: "/"},
		{Name: "jkanime_session", Value: "engine-session", Domain: ".jkanime.net", Path: "/"},
	}
}

// bareCookies is what an engine hands back when it reports no cookie domain: the transport
// scopes the clearance to the host it solved for.
func bareCookies(value string) []*http.Cookie {
	return []*http.Cookie{{Name: clearanceCookie, Value: value}}
}

// solverFunc adapts a function to Solver.
type solverFunc func(context.Context, string, string) (Clearance, error)

// Solve calls f.
func (f solverFunc) Solve(ctx context.Context, o, r string) (Clearance, error) { return f(ctx, o, r) }

// roundTripFunc adapts a function to http.RoundTripper.
type roundTripFunc func(*http.Request) (*http.Response, error)

// RoundTrip calls f.
func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// recorder collects every published event.
type recorder struct {
	mu     sync.Mutex
	events []events.Event
}

// Publish appends the event.
func (r *recorder) Publish(e events.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
}

// all returns a snapshot of the published events.
func (r *recorder) all() []events.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]events.Event(nil), r.events...)
}

// names returns the published event names in order.
func (r *recorder) names() []string {
	var out []string
	for _, e := range r.all() {
		out = append(out, e.Name())
	}
	return out
}

// recordingStore wraps a MemoryStore and records every write it receives.
type recordingStore struct {
	*MemoryStore
	mu      sync.Mutex
	saves   []Clearance
	deletes []string
}

// Save records c and stores it.
func (s *recordingStore) Save(domain string, c Clearance) {
	s.mu.Lock()
	s.saves = append(s.saves, c)
	s.mu.Unlock()
	s.MemoryStore.Save(domain, c)
}

// Delete records domain and forgets it.
func (s *recordingStore) Delete(domain string) {
	s.mu.Lock()
	s.deletes = append(s.deletes, domain)
	s.mu.Unlock()
	s.MemoryStore.Delete(domain)
}

// fakeClock is an injectable clock that only moves when a test moves it.
type fakeClock struct {
	mu   sync.Mutex
	at   time.Time
	step time.Duration
}

// Now returns the current fake time, advancing it by step afterwards.
func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.at
	c.at = c.at.Add(c.step)
	return now
}

// Advance moves the clock forward by d.
func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.at = c.at.Add(d)
}

// harness wires a Transport to a fake upstream, solver, recording store and event recorder.
type harness struct {
	cf     *fakeCloudflare
	solver *fakeSolver
	store  *recordingStore
	bus    *recorder
	log    *sharedlogger.MemLogger
	clock  *fakeClock
	tr     *Transport
}

// harnessSolveTimeout bounds a solve in the harness, so a transport mutated into never
// releasing a solve costs a test seconds rather than the production default.
const harnessSolveTimeout = 2 * time.Second

// newHarness builds a transport over a fake upstream that accepts the given cf_clearance values.
func newHarness(solver *fakeSolver, policy Policy, accepted ...string) *harness {
	if policy.SolveTimeout == 0 {
		policy.SolveTimeout = harnessSolveTimeout
	}
	h := &harness{
		cf:     &fakeCloudflare{accepted: map[string]bool{}},
		solver: solver,
		store:  &recordingStore{MemoryStore: NewMemoryStore()},
		bus:    &recorder{},
		log:    newTestLog(),
		clock:  &fakeClock{at: time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)},
	}
	for _, v := range accepted {
		h.cf.accepted[v] = true
	}
	h.tr = NewTransport(h.cf, solver, h.store, h.bus, h.log, policy)
	h.tr.now = h.clock.Now
	return h
}

// get sends a GET through rt with the adapter's own User-Agent and fails the test on error.
// The request gives up after ten seconds, so a transport mutated into never finishing a shared
// solve fails the test instead of hanging the suite.
func get(t *testing.T, rt http.RoundTripper, url string) *http.Response {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", adapterUA)
	resp, err := rt.RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

// readBody drains and returns resp's body.
func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// waitUntil polls cond until it holds or the test's budget runs out.
func waitUntil(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition never held")
		}
		time.Sleep(time.Millisecond)
	}
}

// assertStatusAndCalls checks the response status and how many solves ran.
func assertStatusAndCalls(t *testing.T, resp *http.Response, solver *fakeSolver, wantStatus int, wantCalls int32) {
	t.Helper()
	if resp.StatusCode != wantStatus || solver.calls.Load() != wantCalls {
		t.Fatalf("status=%d solves=%d, want status=%d solves=%d", resp.StatusCode, solver.calls.Load(), wantStatus, wantCalls)
	}
}

// eventAt returns the i-th published event or fails the test when there is none.
func eventAt(t *testing.T, bus *recorder, i int) events.Event {
	t.Helper()
	all := bus.all()
	if i >= len(all) {
		t.Fatalf("event %d missing, published: %v", i, bus.names())
	}
	return all[i]
}

// eventLine renders an event as a stable one-line string for comparisons.
func eventLine(e events.Event) string {
	return fmt.Sprintf("%s %+v", e.Name(), e)
}

// newTestLog returns the in-memory logger a transport under test writes its facts to.
func newTestLog() *sharedlogger.MemLogger {
	return sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
}

// logLines renders the transport's log rows as "level domain eventType duration metadata", leaving out
// the message prose and the timestamp so a test pins what Activity filters and groups on.
func logLines(log *sharedlogger.MemLogger) []string {
	var lines []string
	for _, entry := range log.Recent() {
		lines = append(lines, fmt.Sprintf("%s %s %s %dms %v", entry.Level, entry.Domain, entry.EventType, entry.DurationMs, entry.Metadata))
	}
	return lines
}
