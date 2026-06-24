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

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, animePageWithTokensFixture)
	}))
	defer srv.Close()

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

func TestExtractAnimeIDAndCSRFTokenFailsWhenAnimeIDMissing(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, animePageMissingAnimeIDFixture)
	}))
	defer srv.Close()

	adapter := New(srv.Client())

	_, _, err := adapter.fetchAnimeInfo(context.Background(), srv.URL+"/")
	if err == nil {
		t.Fatal("expected an explicit error when anime ID is missing")
	}
}

func TestExtractAnimeIDAndCSRFTokenFailsWhenCSRFMissing(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, animePageMissingCSRFFixture)
	}))
	defer srv.Close()

	adapter := New(srv.Client())

	_, _, err := adapter.fetchAnimeInfo(context.Background(), srv.URL+"/")
	if err == nil {
		t.Fatal("expected an explicit error when csrf token is missing")
	}
}

// --- AJAX episode listing (4.3/4.4) ---

func TestFetchEpisodesReturnsParsedListWhenTotalGreaterThanZero(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/ajax/episodes/") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		fmt.Fprint(w, ajaxEpisodesWithDataFixture)
	}))
	defer srv.Close()

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

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, ajaxEpisodesZeroTotalFixture)
	}))
	defer srv.Close()

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
func TestListEpisodesReturnsHighestEpisodeNumberNotEntryCount(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/ajax/episodes/"):
			fmt.Fprint(w, ajaxEpisodesWithDataFixture)
		default:
			fmt.Fprint(w, animePageWithTokensFixture)
		}
	}))
	defer srv.Close()

	adapter := newWithBaseURL(srv.Client(), srv.URL)

	listing, err := adapter.ListEpisodes(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("ListEpisodes: %v", err)
	}
	if listing.LatestEpisode != 4 {
		t.Fatalf("expected highest episode number 4 (gap at 3), got %d", listing.LatestEpisode)
	}
}

func TestListEpisodesReturnsNoEpisodesAvailableWhenAjaxTotalIsZero(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/ajax/episodes/"):
			fmt.Fprint(w, ajaxEpisodesZeroTotalFixture)
		default:
			fmt.Fprint(w, animePageWithTokensFixture)
		}
	}))
	defer srv.Close()

	adapter := newWithBaseURL(srv.Client(), srv.URL)

	listing, err := adapter.ListEpisodes(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("zero episodes must not be an error: %v", err)
	}
	if listing.LatestEpisode != 0 {
		t.Fatalf("expected LatestEpisode=0 when no episodes available, got %d", listing.LatestEpisode)
	}
}

// --- download link extraction (4.5/4.6) ---

func TestExtractLinksReturnsHosterTaggedLinksOnWellFormedServerList(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, episodePageWithServersFixture)
	}))
	defer srv.Close()

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

func TestExtractLinksReturnsLoudErrorWhenServersArrayMissing(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, episodePageMissingServersFixture)
	}))
	defer srv.Close()

	adapter := New(srv.Client())

	links, err := adapter.ExtractLinks(context.Background(), srv.URL+"/1/")
	if err == nil {
		t.Fatal("expected a loud error when servers array cannot be parsed (template drift)")
	}
	if len(links) != 0 {
		t.Fatalf("expected zero links alongside the error, got %d", len(links))
	}
}

func TestExtractLinksReturnsLoudErrorWhenServersArrayIsEmpty(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, episodePageEmptyServersFixture)
	}))
	defer srv.Close()

	adapter := New(srv.Client())

	links, err := adapter.ExtractLinks(context.Background(), srv.URL+"/1/")
	if err == nil {
		t.Fatal("expected a loud error when zero links are extracted -- never a silent empty success")
	}
	if len(links) != 0 {
		t.Fatalf("expected zero links alongside the error, got %d", len(links))
	}
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
