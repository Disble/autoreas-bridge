package jkanime

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- fixtures (recorded shape, not live network -- AGENTS real-boundary rule via httptest.Server) ---

const animePageWithTokensFixture = `<!DOCTYPE html>
<html>
<head>
<meta name="csrf-token" content="AbCdEf123456TokenValue">
</head>
<body>
<div class="anime__details" data-anime="987">Some Anime</div>
</body>
</html>`

const animePageMissingAnimeIDFixture = `<!DOCTYPE html>
<html>
<head>
<meta name="csrf-token" content="AbCdEf123456TokenValue">
</head>
<body>
<div class="anime__details">Some Anime</div>
</body>
</html>`

const animePageMissingCSRFFixture = `<!DOCTYPE html>
<html>
<head>
</head>
<body>
<div class="anime__details" data-anime="987">Some Anime</div>
</body>
</html>`

const ajaxEpisodesWithDataFixture = `{
  "current_page": 1,
  "success": true,
  "data": [
    {"number": 1, "id": 1001, "image": "1.jpg"},
    {"number": 2, "id": 1002, "image": "2.jpg"},
    {"number": 4, "id": 1004, "image": "4.jpg"}
  ],
  "total": 3
}`

const ajaxEpisodesZeroTotalFixture = `{
  "current_page": 1,
  "success": true,
  "data": [],
  "total": 0
}`

// servers array fixture: base64("https://www.mediafire.com/file/abc/ep1.mp4")
const episodePageWithServersFixture = `<!DOCTYPE html>
<html><body>
<script>
var servers = [
  {"remote":"aHR0cHM6Ly93d3cubWVkaWFmaXJlLmNvbS9maWxlL2FiYy9lcDEubXA0","server":"Mediafire","size":"350 MB","lang":1},
  {"remote":"aHR0cHM6Ly9tZWdhLm56L2ZpbGUveHl6","server":"Mega","size":"340 MB","lang":1}
];
</script>
</body></html>`

const episodePageMissingServersFixture = `<!DOCTYPE html>
<html><body>
<script>
// template drifted -- no var servers array here
</script>
</body></html>`

const episodePageEmptyServersFixture = `<!DOCTYPE html>
<html><body>
<script>
var servers = [];
</script>
</body></html>`

// --- CSRF / anime-ID extraction (4.1/4.2) ---

func TestExtractAnimeIDAndCSRFTokenSucceedsWhenBothPresent(t *testing.T) {
	t.Parallel()

	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := fmt.Fprint(w, animePageWithTokensFixture); err != nil {
			t.Errorf("write fixture response: %v", err)
		}
	}))

	adapter := New(srv.Client())

	animeID, csrfToken, err := adapter.fetchAnimeInfo(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("fetchAnimeInfo: %v", err)
	}
	if animeID != "987" {
		t.Fatalf("expected anime id 987, got %q", animeID)
	}
	if csrfToken != "AbCdEf123456TokenValue" {
		t.Fatalf("expected csrf token, got %q", csrfToken)
	}
}

func TestExtractAnimeIDAndCSRFTokenRejectsIncompletePages(t *testing.T) {
	t.Parallel()
	for _, test := range []struct{ name, fixture string }{
		{"missing anime ID", animePageMissingAnimeIDFixture},
		{"missing csrf token", animePageMissingCSRFFixture},
	} {
		t.Run(test.name, func(t *testing.T) {
			srv := newFixtureServer(t, test.fixture)
			_, _, err := New(srv.Client()).fetchAnimeInfo(context.Background(), srv.URL+"/")
			if err == nil {
				t.Fatal("expected an explicit extraction error")
			}
		})
	}
}

// --- AJAX episode listing (4.3/4.4) ---

func TestFetchEpisodesReturnsParsedListWhenTotalGreaterThanZero(t *testing.T) {
	t.Parallel()

	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/ajax/episodes/") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if _, err := fmt.Fprint(w, ajaxEpisodesWithDataFixture); err != nil {
			t.Errorf("write fixture response: %v", err)
		}
	}))

	adapter := newWithBaseURL(srv.Client(), srv.URL)

	episodes, total, err := adapter.fetchEpisodes(context.Background(), "555", "tok")
	if err != nil {
		t.Fatalf("fetchEpisodes: %v", err)
	}
	if total != 3 {
		t.Fatalf("expected total=3, got %d", total)
	}
	if len(episodes) != 3 {
		t.Fatalf("expected 3 episodes, got %d", len(episodes))
	}
}

func TestFetchEpisodesTreatsZeroTotalAsNoEpisodesNotAnError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := fmt.Fprint(w, ajaxEpisodesZeroTotalFixture); err != nil {
			t.Errorf("write fixture response: %v", err)
		}
	}))

	adapter := newWithBaseURL(srv.Client(), srv.URL)

	episodes, total, err := adapter.fetchEpisodes(context.Background(), "555", "tok")
	if err != nil {
		t.Fatalf("zero total must NOT be an error, got: %v", err)
	}
	if total != 0 {
		t.Fatalf("expected total=0, got %d", total)
	}
	if len(episodes) != 0 {
		t.Fatalf("expected 0 episodes, got %d", len(episodes))
	}
}

// ListEpisodes integration: highest episode number, not entry count (numbering gap [1,2,4]).
func TestListEpisodesReturnsLatestEpisodeFromAJAXResponse(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name, ajax string
		want       int
	}{
		{"highest episode number over entry count", ajaxEpisodesWithDataFixture, 4},
		{"zero total", ajaxEpisodesZeroTotalFixture, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			srv := newEpisodeListingServer(t, test.ajax)
			listing, err := newWithBaseURL(srv.Client(), srv.URL).ListEpisodes(context.Background(), srv.URL+"/")
			if err != nil {
				t.Fatalf("ListEpisodes: %v", err)
			}
			if listing.LatestEpisode != test.want {
				t.Fatalf("LatestEpisode = %d, want %d", listing.LatestEpisode, test.want)
			}
		})
	}
}

func TestEpisodePageURLReturnsSpecificEpisodeURL(t *testing.T) {
	t.Parallel()

	adapter := New(http.DefaultClient)

	got, err := adapter.EpisodePageURL(context.Background(), "https://jkanime.net/anime", 10)
	if err != nil {
		t.Fatalf("EpisodePageURL: %v", err)
	}
	if got != "https://jkanime.net/anime/10/" {
		t.Fatalf("expected specific episode URL, got %q", got)
	}
}

// --- download link extraction (4.5/4.6) ---

func TestExtractLinksReturnsHosterTaggedLinksOnWellFormedServerList(t *testing.T) {
	t.Parallel()

	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := fmt.Fprint(w, episodePageWithServersFixture); err != nil {
			t.Errorf("write fixture response: %v", err)
		}
	}))

	adapter := New(srv.Client())

	links, err := adapter.ExtractLinks(context.Background(), srv.URL+"/1/")
	if err != nil {
		t.Fatalf("ExtractLinks: %v", err)
	}
	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d", len(links))
	}
	if links[0].Hoster != "Mediafire" || !strings.Contains(links[0].URL, "mediafire.com") {
		t.Fatalf("unexpected first link: %#v", links[0])
	}
	if links[1].Hoster != "Mega" {
		t.Fatalf("unexpected second link: %#v", links[1])
	}
}

func TestExtractLinksRejectsInvalidServerLists(t *testing.T) {
	t.Parallel()
	for _, test := range []struct{ name, fixture string }{
		{"missing servers array", episodePageMissingServersFixture},
		{"empty servers array", episodePageEmptyServersFixture},
	} {
		t.Run(test.name, func(t *testing.T) {
			srv := newFixtureServer(t, test.fixture)
			links, err := New(srv.Client()).ExtractLinks(context.Background(), srv.URL+"/1/")
			if err == nil {
				t.Fatal("expected a loud server-list error")
			}
			if len(links) != 0 {
				t.Fatalf("expected zero links alongside the error, got %d", len(links))
			}
		})
	}
}

// newFixtureServer serves the supplied fixture from a test HTTP server.
func newFixtureServer(t *testing.T, fixture string) *httptest.Server {
	t.Helper()
	return httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if _, err := fmt.Fprint(w, fixture); err != nil {
			t.Errorf("write fixture response: %v", err)
		}
	}))
}

// newEpisodeListingServer serves page and AJAX episode fixtures for tests.
func newEpisodeListingServer(t *testing.T, ajaxFixture string) *httptest.Server {
	t.Helper()
	return httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fixture := animePageWithTokensFixture
		if strings.Contains(r.URL.Path, "/ajax/episodes/") {
			fixture = ajaxFixture
		}
		if _, err := fmt.Fprint(w, fixture); err != nil {
			t.Errorf("write fixture response: %v", err)
		}
	}))
}

// --- registry plumbing ---

func TestDescriptorAndMatchesIdentifyJkanimePages(t *testing.T) {
	t.Parallel()

	adapter := New(http.DefaultClient)

	if adapter.Descriptor().Name != "jkanime" {
		t.Fatalf("unexpected descriptor name: %q", adapter.Descriptor().Name)
	}
	if !adapter.Matches("https://jkanime.net/some-anime/") {
		t.Fatal("expected Matches to be true for a jkanime.net URL")
	}
	if !adapter.Matches("https://jkanime.bz/some-anime/") {
		t.Fatal("expected Matches to be true for a jkanime.bz URL")
	}
	if adapter.Matches("https://otherhost.example/anime/") {
		t.Fatal("expected Matches to be false for an unrelated host")
	}
}
