package cfclearance

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"
)

// errCooldown marks a challenge met while the domain's cooldown is open; no solve starts.
var errCooldown = errors.New("cfclearance: domain is cooling down after a failed solve")

// errNoFreshClearance marks a solver result that repeats the rejected value or has no cookie.
var errNoFreshClearance = errors.New("cfclearance: solver returned no fresh cf_clearance")

// errNoUserAgent marks a solver result without the identity the clearance is bound to.
var errNoUserAgent = errors.New("cfclearance: solver returned no User-Agent; the clearance is bound to it")

// Transport is the http.RoundTripper provider clients pass through. It is safe for concurrent
// use; the only state it keeps is the clearance per registrable domain, in its store, plus the
// solve that may be in flight for that domain and the cooldown a failed solve opened.
type Transport struct {
	base      http.RoundTripper
	solver    Solver
	store     ClearanceStore
	publisher Publisher
	policy    Policy
	now       func() time.Time
	slots     chan struct{}

	mu       sync.Mutex
	inflight map[string]*solveCall
	cooldown map[string]time.Time
}

// solveCall lets concurrent challenged requests for one domain share a single solve.
type solveCall struct {
	done chan struct{}
	err  error
}

// NewTransport wraps base with challenge handling. Every dependency is optional: a nil base
// means http.DefaultTransport, a nil solver means UnsupportedSolver, a nil store means a fresh
// MemoryStore, a nil publisher drops events and a zero Policy means every default.
func NewTransport(base http.RoundTripper, solver Solver, store ClearanceStore, publisher Publisher, policy Policy) *Transport {
	if base == nil {
		base = http.DefaultTransport
	}
	if solver == nil {
		solver = UnsupportedSolver{}
	}
	if store == nil {
		store = NewMemoryStore()
	}
	if publisher == nil {
		publisher = nopPublisher{}
	}
	policy = policy.withDefaults()
	return &Transport{
		base:      base,
		solver:    solver,
		store:     store,
		publisher: publisher,
		policy:    policy,
		now:       time.Now,
		slots:     make(chan struct{}, policy.MaxConcurrentSolves),
		inflight:  map[string]*solveCall{},
		cooldown:  map[string]time.Time{},
	}
}

// RoundTrip sends req with any stored clearance for its domain and, on a challenge, solves and
// replays it. Only HTTPS requests to eligible hosts are handled; everything else passes through.
func (t *Transport) RoundTrip(req *http.Request) (*http.Response, error) {
	if !t.policy.admits(req.URL.Scheme, req.URL.Hostname()) {
		return t.base.RoundTrip(req)
	}
	domain := registrableDomain(req.URL.Hostname())
	for attempt := 1; ; attempt++ {
		out, sent := t.decorate(req, domain)
		resp, err := t.base.RoundTrip(out)
		if err != nil {
			return resp, err
		}
		kind, challenged := detectChallenge(resp)
		if !challenged {
			return resp, nil
		}
		t.publisher.Publish(ChallengeDetectedEvent{Domain: domain, Attempt: attempt, Reason: kind})
		if attempt > t.policy.MaxSolvesPerRequest || !replayable(req) {
			return resp, nil
		}
		if err := t.ensureFresh(req, domain, sent, attempt); err != nil {
			return resp, nil // the challenge response is the honest answer when solving fails
		}
		drain(resp)
		if req, err = rewound(req); err != nil {
			return nil, err
		}
	}
}

// decorate returns a copy of req carrying the stored clearance cookies that apply to its URL
// and the User-Agent bound to them, read from one store snapshot, plus the cf_clearance value
// it sends ("" when none).
func (t *Transport) decorate(req *http.Request, domain string) (*http.Request, string) {
	stored, ok := t.store.Load(domain)
	if !ok {
		return req, ""
	}
	out := req.Clone(req.Context())
	sent := ""
	for _, c := range stored.Cookies {
		if !cookieMatches(c, req.URL) {
			continue
		}
		if _, err := req.Cookie(c.Name); err == nil {
			continue // the caller's own value wins
		}
		out.AddCookie(&http.Cookie{Name: c.Name, Value: c.Value})
		if c.Name == clearanceCookie {
			sent = c.Value
		}
	}
	if stored.UserAgent != "" {
		out.Header.Set("User-Agent", stored.UserAgent)
	}
	return out, sent
}

// ensureFresh makes sure the stored clearance differs from rejected, solving at most once per
// domain at a time; a request that waited on another's solve reuses its result.
func (t *Transport) ensureFresh(req *http.Request, domain, rejected string, attempt int) error {
	t.mu.Lock()
	if current := t.currentClearance(req, domain); current != "" && current != rejected {
		t.mu.Unlock()
		return nil
	}
	if call, ok := t.inflight[domain]; ok {
		t.mu.Unlock()
		return call.wait(req.Context())
	}
	if rejected != "" {
		t.store.Delete(domain) // a refused clearance is garbage whatever happens next
	}
	if t.now().Before(t.cooldown[domain]) { // a domain never cooled down has the zero time
		t.mu.Unlock()
		return errCooldown
	}
	call := &solveCall{done: make(chan struct{})}
	t.inflight[domain] = call
	t.mu.Unlock()

	call.err = t.solve(req, domain, rejected, attempt)

	t.mu.Lock()
	delete(t.inflight, domain)
	if call.err != nil {
		t.cooldown[domain] = t.now().Add(t.policy.Cooldown)
	}
	t.mu.Unlock()
	close(call.done)
	return call.err
}

// currentClearance returns the stored cf_clearance that applies to req's URL, or "".
func (t *Transport) currentClearance(req *http.Request, domain string) string {
	stored, ok := t.store.Load(domain)
	if !ok {
		return ""
	}
	for _, c := range stored.Cookies {
		if c.Name == clearanceCookie && cookieMatches(c, req.URL) {
			return c.Value
		}
	}
	return ""
}

// wait blocks until the shared solve finishes or ctx ends.
func (c *solveCall) wait(ctx context.Context) error {
	select {
	case <-c.done:
		return c.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// solve runs one solve for domain and announces its outcome.
func (t *Transport) solve(req *http.Request, domain, rejected string, attempt int) error {
	start := t.now()
	err := t.runSolver(req, domain, rejected)
	elapsed := t.now().Sub(start).Milliseconds()
	if err != nil {
		t.publisher.Publish(ClearanceFailedEvent{Domain: domain, Attempt: attempt, DurationMs: elapsed, Reason: err.Error()})
		return err
	}
	t.publisher.Publish(ClearanceSolvedEvent{Domain: domain, Attempt: attempt, DurationMs: elapsed})
	return nil
}

// runSolver takes a solver slot, runs the Solver within SolveTimeout detached from the
// triggering request's cancellation, so one caller giving up does not waste a solve other
// waiters share, and stores what it yields as one value.
func (t *Transport) runSolver(req *http.Request, domain, rejected string) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(req.Context()), t.policy.SolveTimeout)
	defer cancel()
	select {
	case t.slots <- struct{}{}:
		defer func() { <-t.slots }()
	case <-ctx.Done():
		return ctx.Err()
	}
	got, err := t.solver.Solve(ctx, req.URL.Scheme+"://"+req.URL.Host, rejected)
	if err != nil {
		return err
	}
	if !hasFreshClearance(got.Cookies, rejected) {
		return errNoFreshClearance
	}
	if got.UserAgent == "" {
		return errNoUserAgent
	}
	t.store.Save(domain, Clearance{
		Cookies:   cloudflareCookies(got.Cookies, req.URL.Hostname()),
		UserAgent: got.UserAgent,
	})
	return nil
}

// replayable reports whether req can be sent a second time.
func replayable(req *http.Request) bool {
	return req.Body == nil || req.Body == http.NoBody || req.GetBody != nil
}

// rewound returns req ready to be sent again, with a fresh body from GetBody when it has one.
func rewound(req *http.Request) (*http.Request, error) {
	if req.GetBody == nil {
		return req, nil
	}
	body, err := req.GetBody()
	if err != nil {
		return nil, err
	}
	out := req.Clone(req.Context())
	out.Body = body
	return out, nil
}

// drain closes a response that is about to be replaced by a replay; a transport's response
// always carries a body.
func drain(resp *http.Response) {
	_ = resp.Body.Close()
}
