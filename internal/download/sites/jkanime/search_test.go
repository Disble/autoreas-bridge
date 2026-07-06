package jkanime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func serveSearchFixture(t *testing.T, fixture string) *httptest.Server {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", fixture))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/buscar/") {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestSearcherParsesResultTitlesAndURLs(t *testing.T) {
	srv := serveSearchFixture(t, "buscar_dr_stone.html")
	searcher := newSearcherWithBaseURL(srv.Client(), srv.URL)

	results, err := searcher.Search(context.Background(), "dr stone")
	if err != nil {
		t.Fatalf("Search: %v", err)
	}

	if len(results) != 8 {
		t.Fatalf("expected 8 results, got %d: %+v", len(results), results)
	}

	// First result is the base entry; the franchise family must all appear.
	if results[0].Title != "Dr. Stone" || results[0].PageURL != "https://jkanime.net/dr-stone/" {
		t.Fatalf("unexpected first result: %+v", results[0])
	}

	wantURL := map[string]bool{
		"https://jkanime.net/dr-stone/":                       false,
		"https://jkanime.net/dr-stone-science-future-part-3/": false,
		"https://jkanime.net/dr-stone-science-future-part-2/": false,
	}
	for _, r := range results {
		if _, ok := wantURL[r.PageURL]; ok {
			wantURL[r.PageURL] = true
		}
		if r.Title == "" || r.PageURL == "" {
			t.Fatalf("empty field in result: %+v", r)
		}
	}
	for u, seen := range wantURL {
		if !seen {
			t.Fatalf("expected result URL not found: %s", u)
		}
	}
}

func TestSearcherReturnsEmptyOnNoResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<html><body><div class="no-results">Nada</div></body></html>`))
	}))
	t.Cleanup(srv.Close)
	searcher := newSearcherWithBaseURL(srv.Client(), srv.URL)

	results, err := searcher.Search(context.Background(), "anime que no existe")
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestSearcherEscapesQueryInURL(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`<html></html>`))
	}))
	t.Cleanup(srv.Close)
	searcher := newSearcherWithBaseURL(srv.Client(), srv.URL)

	if _, err := searcher.Search(context.Background(), "dr stone"); err != nil {
		t.Fatalf("Search: %v", err)
	}
	if !strings.HasPrefix(gotPath, "/buscar/") || !strings.Contains(gotPath, "dr") {
		t.Fatalf("unexpected search path: %s", gotPath)
	}
}
