package cfclearance

import (
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
)

func TestEventNames(t *testing.T) {
	cases := []struct {
		event events.Event
		want  string
	}{
		{ChallengeDetectedEvent{}, "clearance.challenge_detected"},
		{ClearanceSolvedEvent{}, "clearance.solved"},
		{ClearanceFailedEvent{}, "clearance.failed"},
	}
	for _, tc := range cases {
		if got := tc.event.Name(); got != tc.want {
			t.Errorf("%T.Name() = %q, want %q", tc.event, got, tc.want)
		}
	}
}

func TestEventsTellTheStoryOfASolveWithoutCookieValues(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"secret-stale", "secret-fresh"}}, Policy{}, "secret-fresh")
	h.clock.step = 1500 * time.Millisecond

	get(t, h.tr, siteURL)

	want := []string{
		"clearance.challenge_detected {Domain:jkanime.net Attempt:1 Reason:cf_mitigated}",
		"clearance.solved {Domain:jkanime.net Attempt:1 DurationMs:1500}",
		"clearance.challenge_detected {Domain:jkanime.net Attempt:2 Reason:cf_mitigated}",
		"clearance.solved {Domain:jkanime.net Attempt:2 DurationMs:1500}",
	}
	var got []string
	for _, e := range h.bus.all() {
		got = append(got, eventLine(e))
	}
	if !slices.Equal(got, want) {
		t.Fatalf("events:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

func TestFailedEventCarriesDurationAndReasonButNoCookie(t *testing.T) {
	h := newHarness(&fakeSolver{err: errors.New("engine said secret-value")}, Policy{}, "good")
	h.store.Save("jkanime.net", Clearance{UserAgent: engineUA, Cookies: engineCookies("secret-old")})
	h.clock.step = 250 * time.Millisecond

	get(t, h.tr, siteURL)

	failed := eventAt(t, h.bus, 1).(ClearanceFailedEvent)
	if failed.Domain != "jkanime.net" || failed.Attempt != 1 || failed.DurationMs != 250 || failed.Reason != "engine said secret-value" {
		t.Fatalf("failed = %+v", failed)
	}
	for _, e := range h.bus.all() {
		if line := eventLine(e); strings.Contains(line, "secret-old") {
			t.Fatalf("event carries the rejected cookie value: %s", line)
		}
	}
}

func TestClearanceIsStoredAsOneValueWithItsUserAgent(t *testing.T) {
	h := newHarness(&fakeSolver{values: []string{"good"}}, Policy{}, "good")

	get(t, h.tr, siteURL)

	if len(h.store.saves) != 1 {
		t.Fatalf("saves = %d, want the cookies and their User-Agent written together once", len(h.store.saves))
	}
	saved := h.store.saves[0]
	if saved.UserAgent != engineUA || !hasFreshClearance(saved.Cookies, "") {
		t.Fatalf("saved = %+v, want the engine identity next to its cookie", saved)
	}
}

// alternatingStore answers each Load with a different clearance, so a reader that loads twice
// pairs one snapshot's cookie with another's User-Agent.
type alternatingStore struct {
	MemoryStore
	loads int
}

// Load alternates between clearance "a" with identity "ua-a" and clearance "b" with "ua-b".
func (s *alternatingStore) Load(string) (Clearance, bool) {
	s.loads++
	v := "a"
	if s.loads%2 == 0 {
		v = "b"
	}
	return Clearance{UserAgent: "ua-" + v, Cookies: engineCookies(v)[:1]}, true
}

func TestReplayPairsCookieAndUserAgentFromOneSnapshot(t *testing.T) {
	h := newHarness(&fakeSolver{}, Policy{}, "a", "b")
	h.tr.store = &alternatingStore{}

	get(t, h.tr, siteURL)

	sent := h.cf.last()
	c, _ := sent.Cookie(clearanceCookie)
	if ua := sent.Header.Get("User-Agent"); c == nil || ua != "ua-"+c.Value {
		t.Fatalf("cookie=%v ua=%q, want both from the same snapshot", c, ua)
	}
}

func TestEventsReachTheBridgeBus(t *testing.T) {
	bus := events.NewBus()
	var seen []string
	bus.Subscribe(EventNameClearanceSolved, func(e events.Event) { seen = append(seen, e.Name()) })
	cf := &fakeCloudflare{accepted: map[string]bool{"good": true}}
	tr := NewTransport(cf, &fakeSolver{values: []string{"good"}}, nil, bus, Policy{})

	resp := get(t, tr, siteURL)

	if resp.StatusCode != http.StatusOK || !slices.Equal(seen, []string{EventNameClearanceSolved}) {
		t.Fatalf("status=%d seen=%v", resp.StatusCode, seen)
	}
}
