package myanimelist

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

// newFixtureServer starts an httptest.Server that always serves the JSON
// fixture at fixturePath, recording every request's raw query string in
// the returned pointer.
func newFixtureServer(t *testing.T, fixturePath string) (server *httptest.Server, lastQuery *string) {
	t.Helper()

	body, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture %s: %v", fixturePath, err)
	}
	lastQuery = new(string)
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*lastQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	return server, lastQuery
}

func TestClientSearchReturnsPinnedCandidatesForBleach(t *testing.T) {
	t.Parallel()

	server, lastQuery := newFixtureServer(t, "testdata/search_bleach.json")
	defer server.Close()

	client := NewClient(NewHTTPClient(time.Second, 1<<20, ""), server.URL)

	result, err := client.Search(context.Background(), "Bleach: Sennen Kessen-hen")
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(result.Candidates) != 6 {
		t.Fatalf("expected 6 candidates, got %d", len(result.Candidates))
	}
	top := result.Candidates[0]
	if top.ID != 41467 {
		t.Fatalf("expected top candidate id 41467, got %d", top.ID)
	}
	if top.Name != "Bleach: Sennen Kessen-hen" {
		t.Fatalf("expected top candidate name %q, got %q", "Bleach: Sennen Kessen-hen", top.Name)
	}
	if top.MediaType != "TV" {
		t.Fatalf("expected media type TV, got %q", top.MediaType)
	}
	if top.StartYear != 2022 {
		t.Fatalf("expected start year 2022, got %d", top.StartYear)
	}

	// The request the fake server received must carry the
	// url.QueryEscape'd keyword — proven two ways: the decoded value round
	// trips, and the raw wire form matches QueryEscape's exact encoding
	// (space -> '+', ':' -> %3A), not some other escaping scheme.
	gotQuery, err := url.ParseQuery(*lastQuery)
	if err != nil {
		t.Fatalf("parse recorded query %q: %v", *lastQuery, err)
	}
	const wantKeyword = "Bleach: Sennen Kessen-hen"
	if got := gotQuery.Get("keyword"); got != wantKeyword {
		t.Fatalf("expected keyword %q, got %q", wantKeyword, got)
	}
	const wantRawQuery = "type=anime&keyword=Bleach%3A+Sennen+Kessen-hen&v=1"
	if *lastQuery != wantRawQuery {
		t.Fatalf("expected escaped raw query %q, got %q", wantRawQuery, *lastQuery)
	}
}

func TestClientSearchZeroHitsReturnsEmptyResultNotError(t *testing.T) {
	t.Parallel()

	server, _ := newFixtureServer(t, "testdata/search_zero_hits.json")
	defer server.Close()

	client := NewClient(NewHTTPClient(time.Second, 1<<20, ""), server.URL)

	result, err := client.Search(context.Background(), "Shokuguemi no Soma")
	if err != nil {
		t.Fatalf("expected zero hits to not be an error, got %v", err)
	}
	if len(result.Candidates) != 0 {
		t.Fatalf("expected zero candidates, got %d", len(result.Candidates))
	}
}

func TestClientSearchTypoQueryStillReturnsSixCandidates(t *testing.T) {
	t.Parallel()

	server, _ := newFixtureServer(t, "testdata/search_typo.json")
	defer server.Close()

	client := NewClient(NewHTTPClient(time.Second, 1<<20, ""), server.URL)

	result, err := client.Search(context.Background(), "Bleach: Sennen Kesen-hen")
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(result.Candidates) != 6 {
		t.Fatalf("expected typo-tolerant 6 candidates, got %d", len(result.Candidates))
	}
	if result.Candidates[0].ID != 41467 {
		t.Fatalf("expected typo query's top candidate id 41467, got %d", result.Candidates[0].ID)
	}
}

// TestSearchIssuesExactlyOneRequestPerQuery proves non-negotiable #4: there
// is no retry and no fallback strategy (design D11) — Search performs
// exactly one HTTP request no matter the outcome. Without this test, "no
// retry" is a claim nobody verifies.
func TestSearchIssuesExactlyOneRequestPerQuery(t *testing.T) {
	t.Parallel()

	body, err := os.ReadFile("testdata/search_bleach.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	client := NewClient(NewHTTPClient(time.Second, 1<<20, ""), server.URL)

	if _, err := client.Search(context.Background(), "Bleach: Sennen Kessen-hen"); err != nil {
		t.Fatalf("Search: %v", err)
	}
	if got := requestCount.Load(); got != 1 {
		t.Fatalf("expected exactly one request per query, got %d", got)
	}
}
