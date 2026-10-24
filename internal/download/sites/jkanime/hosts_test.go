package jkanime

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// Test hosts of the chain. The in-memory httptest network delivers a request for any
// address to the one server, so a single server routes by Host to play every host.
const (
	challengedBase = "http://challenged.test"
	forbiddenBase  = "http://forbidden.test"
	mirrorBase     = "http://mirror.test"
	secondBase     = "http://second.test"
)

// hostRoutedServer plays several hosts: challengedBase and secondBase answer the way
// Cloudflare's managed challenge does (HTTP 403 + `Cf-Mitigated: challenge`, observed live
// on jkanime.net 2026-10-23), forbiddenBase answers a plain 403, and mirrorBase serves the
// mirror handler. It records every request's host and Referer.
type hostRoutedServer struct {
	mu       sync.Mutex
	hosts    []string
	referers []string
	client   *http.Client
}

// newHostRoutedServer starts a hostRoutedServer whose mirror host serves mirror.
func newHostRoutedServer(t *testing.T, mirror http.HandlerFunc) *hostRoutedServer {
	t.Helper()
	routed := &hostRoutedServer{}
	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		routed.mu.Lock()
		routed.hosts = append(routed.hosts, r.Host)
		routed.referers = append(routed.referers, r.Header.Get("Referer"))
		routed.mu.Unlock()
		switch "http://" + r.Host {
		case challengedBase, secondBase:
			w.Header().Set("Cf-Mitigated", "challenge")
			w.WriteHeader(http.StatusForbidden)
		case forbiddenBase:
			w.WriteHeader(http.StatusForbidden)
		default:
			mirror(w, r)
		}
	}))
	routed.client = srv.Client()
	return routed
}

// hits counts the requests received by base.
func (s *hostRoutedServer) hits(base string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for _, host := range s.hosts {
		if "http://"+host == base {
			count++
		}
	}
	return count
}

// mirrorReferers returns the Referer of every request the mirror host received.
func (s *hostRoutedServer) mirrorReferers() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var referers []string
	for i, host := range s.hosts {
		if "http://"+host == mirrorBase {
			referers = append(referers, s.referers[i])
		}
	}
	return referers
}

// serveFixture answers with fixture.
func serveFixture(fixture string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, fixture)
	}
}

// TestListEpisodesFallsBackToTheNextHostOnAChallenge proves a challenged first host hands
// the whole listing (page GET + CSRF-bound AJAX POST) to the next host, with that host's
// own Referer, while the returned episode URL keeps the caller's canonical host.
func TestListEpisodesFallsBackToTheNextHostOnAChallenge(t *testing.T) {
	t.Parallel()
	srv := newHostRoutedServer(t, func(w http.ResponseWriter, r *http.Request) {
		fixture := animePageWithTokensFixture
		if strings.Contains(r.URL.Path, "/ajax/episodes/") {
			fixture = ajaxEpisodesWithDataFixture
		}
		_, _ = fmt.Fprint(w, fixture)
	})

	log := newTestLog()
	listing, err := newWithBaseURL(srv.client, log, challengedBase, mirrorBase).
		ListEpisodes(context.Background(), challengedBase+"/some-anime/")
	if err != nil {
		t.Fatalf("ListEpisodes: %v", err)
	}
	if listing.LatestEpisode != 4 {
		t.Fatalf("LatestEpisode = %d, want 4", listing.LatestEpisode)
	}
	if want := challengedBase + "/some-anime/4/"; listing.EpisodePageURL != want {
		t.Fatalf("EpisodePageURL = %q, want canonical %q", listing.EpisodePageURL, want)
	}
	if got := srv.hits(challengedBase); got != 1 {
		t.Fatalf("challenged host hits = %d, want 1", got)
	}
	referers := srv.mirrorReferers()
	if len(referers) != 2 {
		t.Fatalf("mirror requests = %d, want page + AJAX", len(referers))
	}
	for _, referer := range referers {
		if referer != mirrorBase+"/" {
			t.Fatalf("mirror Referer = %q, want %q", referer, mirrorBase+"/")
		}
	}
	assertFallbackLogged(t, log, "map[from:challenged.test to:mirror.test]")
}

// TestExtractLinksFallsBackToTheNextHostOnAChallenge proves the episode page is re-read
// from the next host when the first one is challenged.
func TestExtractLinksFallsBackToTheNextHostOnAChallenge(t *testing.T) {
	t.Parallel()
	srv := newHostRoutedServer(t, serveFixture(episodePageWithServersFixture))

	links, err := newWithBaseURL(srv.client, newTestLog(), challengedBase, mirrorBase).
		ExtractLinks(context.Background(), challengedBase+"/some-anime/1/")
	if err != nil {
		t.Fatalf("ExtractLinks: %v", err)
	}
	if len(links) != 2 || links[0].Hoster != "Mediafire" {
		t.Fatalf("unexpected links: %#v", links)
	}
}

// TestAPlainForbiddenDoesNotFallBack proves only a Cloudflare challenge moves to the next
// host: any other 403 is the site's real answer and surfaces unchanged.
func TestAPlainForbiddenDoesNotFallBack(t *testing.T) {
	t.Parallel()
	srv := newHostRoutedServer(t, serveFixture(episodePageWithServersFixture))

	_, err := newWithBaseURL(srv.client, newTestLog(), forbiddenBase, mirrorBase).
		ExtractLinks(context.Background(), forbiddenBase+"/some-anime/1/")
	if err == nil || !strings.Contains(err.Error(), "HTTP 403") {
		t.Fatalf("err = %v, want the plain HTTP 403", err)
	}
	if errors.Is(err, errChallenged) {
		t.Fatalf("a plain 403 must not read as a challenge: %v", err)
	}
	if got := srv.hits(mirrorBase); got != 0 {
		t.Fatalf("mirror hits = %d, want 0", got)
	}
}

// TestEveryHostChallengedFailsLoudly proves an exhausted chain names the challenge and
// every host it tried, trying each exactly once.
func TestEveryHostChallengedFailsLoudly(t *testing.T) {
	t.Parallel()
	srv := newHostRoutedServer(t, serveFixture(animePageWithTokensFixture))

	_, err := newWithBaseURL(srv.client, newTestLog(), challengedBase, secondBase).
		ListEpisodes(context.Background(), challengedBase+"/some-anime/")
	if !errors.Is(err, errChallenged) {
		t.Fatalf("err = %v, want errChallenged", err)
	}
	for _, base := range []string{challengedBase, secondBase} {
		if !strings.Contains(err.Error(), base) {
			t.Fatalf("err %q does not name host %s", err, base)
		}
		if got := srv.hits(base); got != 1 {
			t.Fatalf("%s hits = %d, want 1", base, got)
		}
	}
}

// TestSearchFallsBackAndCanonicalizesMirrorPageURLs proves a challenged search moves to
// the next host and that mirror-hosted result URLs come back on jkanime.net, so the
// stored anime page identity never depends on which mirror answered.
func TestSearchFallsBackAndCanonicalizesMirrorPageURLs(t *testing.T) {
	t.Parallel()
	srv := newHostRoutedServer(t, serveFixture(
		`<h5><a href="https://jkanime.org/kyoufu-collector/">Kyoufu Collector</a></h5>`+
			`<h5><a href="https://jkanime.bz/other/">Other</a></h5>`+
			`<h5><a href="https://elsewhere.example/x/">Elsewhere</a></h5>`+
			`<h5><a href="https://jkanime.net/a b/">Canonical</a></h5>`))

	log := newTestLog()
	results, err := newSearcherWithBaseURL(srv.client, log, challengedBase, mirrorBase).
		Search(context.Background(), "kyoufu")
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	want := []string{
		"https://jkanime.net/kyoufu-collector/",
		"https://jkanime.net/other/",
		"https://elsewhere.example/x/",
		"https://jkanime.net/a b/",
	}
	if len(results) != len(want) {
		t.Fatalf("results = %+v, want %d", results, len(want))
	}
	for i, result := range results {
		if result.PageURL != want[i] {
			t.Fatalf("PageURL[%d] = %q, want %q", i, result.PageURL, want[i])
		}
	}
	assertFallbackLogged(t, log, "map[from:challenged.test to:mirror.test]")
}

// TestAURLOutsideTheChainIsTriedOnce proves a page on a host the chain does not know is
// fetched as given, once, instead of being re-sent for every host of the chain.
func TestAURLOutsideTheChainIsTriedOnce(t *testing.T) {
	t.Parallel()
	srv := newHostRoutedServer(t, serveFixture(episodePageWithServersFixture))

	_, err := newWithBaseURL(srv.client, newTestLog(), mirrorBase, secondBase).
		ExtractLinks(context.Background(), challengedBase+"/some-anime/1/")
	if !errors.Is(err, errChallenged) {
		t.Fatalf("err = %v, want errChallenged", err)
	}
	if got := srv.hits(challengedBase); got != 1 {
		t.Fatalf("challenged host hits = %d, want 1", got)
	}
	if got := srv.hits(mirrorBase) + srv.hits(secondBase); got != 0 {
		t.Fatalf("chain host hits = %d, want 0", got)
	}
}

// TestIsChallengeNeedsBothTheForbiddenStatusAndTheHeader proves the challenge signature is
// the pair Cloudflare sends, not either half alone.
func TestIsChallengeNeedsBothTheForbiddenStatusAndTheHeader(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name   string
		status int
		header string
		want   bool
	}{
		{"managed challenge", http.StatusForbidden, "challenge", true},
		{"plain forbidden", http.StatusForbidden, "", false},
		{"header on a non-403", http.StatusServiceUnavailable, "challenge", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: test.status, Header: http.Header{}}
			if test.header != "" {
				resp.Header.Set("Cf-Mitigated", test.header)
			}
			if got := isChallenge(resp); got != test.want {
				t.Fatalf("isChallenge = %v, want %v", got, test.want)
			}
		})
	}
}

// TestMatchesAcceptsEveryMirrorHost proves pages stored on any chain host route here.
func TestMatchesAcceptsEveryMirrorHost(t *testing.T) {
	t.Parallel()
	adapter := New(http.DefaultClient, newTestLog())
	for _, page := range []string{"https://jkanime.net/a/", "https://jkanime.org/a/", "https://jkanime.bz/a/"} {
		if !adapter.Matches(page) {
			t.Fatalf("Matches(%q) = false", page)
		}
	}
}

// newTestLog returns the in-memory logger an adapter or searcher under test writes to.
func newTestLog() *sharedlogger.MemLogger {
	return sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
}

// assertFallbackLogged fails unless log holds exactly one host switch, a warning in the
// jkanime domain whose metadata renders as wantMetadata.
func assertFallbackLogged(t *testing.T, log *sharedlogger.MemLogger, wantMetadata string) {
	t.Helper()
	entries := log.Recent()
	if len(entries) != 1 {
		t.Fatalf("log entries = %+v, want one host switch", entries)
	}
	got := fmt.Sprintf("%s %s %s %v", entries[0].Level, entries[0].Domain, entries[0].EventType, entries[0].Metadata)
	if want := "warn jkanime jkanime.host_fallback " + wantMetadata; got != want {
		t.Fatalf("log row = %q, want %q", got, want)
	}
}
