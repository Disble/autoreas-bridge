package myanimelist

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// TestClientDetailOverHTTPFetchesAndParsesTheRealPage runs the real
// httptest.Server -> httpClient -> parseDetailPage path end to end, so
// the production Fetcher's status check and io.LimitReader are exercised
// too, not just parseDetailPage in isolation (unlike detail_test.go's
// fragment-based unit tests). It also counts requests to prove Detail
// issues exactly one GET per call (non-negotiable #4, detail half).
func TestClientDetailOverHTTPFetchesAndParsesTheRealPage(t *testing.T) {
	t.Parallel()

	body, err := os.ReadFile("testdata/detail_tv.html")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount.Add(1)
		if r.URL.Path != "/anime/41467" {
			t.Errorf("expected request path %q, got %q", "/anime/41467", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	client := NewClient(NewHTTPClient(time.Second, 1<<20, ""), server.URL)

	detail, err := client.Detail(context.Background(), 41467)
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if detail.Title != "Bleach: Sennen Kessen-hen" {
		t.Fatalf("expected title %q, got %q", "Bleach: Sennen Kessen-hen", detail.Title)
	}
	if detail.Type != "TV" {
		t.Fatalf("expected type %q, got %q", "TV", detail.Type)
	}
	if len(detail.Unfilled) != 0 {
		t.Fatalf("expected no unfilled fields, got %v", detail.Unfilled)
	}
	if got := requestCount.Load(); got != 1 {
		t.Fatalf("expected exactly one GET per Detail call, got %d", got)
	}
}

// TestClientDetailBuildsTheURLFromTheNumericIDAlone proves the request
// path is built with fmt.Sprintf("%s/anime/%d", ...) from the numeric
// malID alone (design's Interfaces note): an int cannot inject a path
// segment, which is why a search-payload slug is never accepted as an
// argument in the first place.
func TestClientDetailBuildsTheURLFromTheNumericIDAlone(t *testing.T) {
	t.Parallel()

	body, err := os.ReadFile("testdata/detail_movie.html")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	client := NewClient(NewHTTPClient(time.Second, 1<<20, ""), server.URL)

	if _, err := client.Detail(context.Background(), 32281); err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if gotPath != "/anime/32281" {
		t.Fatalf("expected request path %q, got %q", "/anime/32281", gotPath)
	}
}

// recordingFetcher is a fake Fetcher that fails the test the moment it is
// asked to fetch anything shaped like a detail page. It is used by
// TestClientSearchNeverFetchesADetailPage to prove no code path inside
// Client.Search reaches a detail-page fetch on its own — the Go-side half
// of non-negotiable #5; the user-confirmation gate itself is enforced at
// the hook/UI layer (proven again in Slices 5a/5b).
type recordingFetcher struct {
	t          *testing.T
	searchBody []byte
}

// Fetch implements Fetcher. Any URL containing "/anime/" is treated as a
// detail-page fetch and fails the test immediately; every other URL
// (the search endpoint) returns the canned search fixture.
func (f *recordingFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	if strings.Contains(url, "/anime/") {
		f.t.Fatalf("Search must never fetch a detail page, but got %q", url)
	}
	return f.searchBody, nil
}

// TestClientSearchNeverFetchesADetailPage is non-negotiable #5's Go
// structural half: Search and Detail share no internal call edge, so a
// search alone can never chain into a detail-page fetch.
func TestClientSearchNeverFetchesADetailPage(t *testing.T) {
	t.Parallel()

	body, err := os.ReadFile("testdata/search_bleach.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	fetcher := &recordingFetcher{t: t, searchBody: body}
	client := NewClient(fetcher, "https://myanimelist.example")

	if _, err := client.Search(context.Background(), "Bleach: Sennen Kessen-hen"); err != nil {
		t.Fatalf("Search: %v", err)
	}
}
