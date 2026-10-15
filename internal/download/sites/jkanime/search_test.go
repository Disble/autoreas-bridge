package jkanime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// serveSearchFixture serves a search HTML fixture from a test HTTP server.
func serveSearchFixture(t *testing.T, fixture string) *httptest.Server {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", fixture))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	if results[0].Title != "Dr. Stone" || results[0].PageURL != "https://jkanime.net/dr-stone/" ||
		results[0].ImageURL != "https://cdn.jkdesa.com/assets/images/animes/image/dr-stone.jpg" {
		t.Fatalf("unexpected first result: %+v", results[0])
	}
	if last := results[len(results)-1]; last.ImageURL == "" || last.ImageURL == results[0].ImageURL {
		t.Fatalf("every result carries its own cover, got last %+v", last)
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

// TestSearcherPairsEachCoverWithItsOwnResult proves a result without a cover
// gets none rather than its neighbour's, and that a cover never leaks into the
// next result.
func TestSearcherPairsEachCoverWithItsOwnResult(t *testing.T) {
	const page = `<div class="anime__item"><a href="https://jkanime.net/a/"><div data-setbg="https://cdn.example/a.jpg"></div></a>` +
		`<h5><a href="https://jkanime.net/a/">A</a></h5></div>` +
		`<div class="anime__item"><h5><a href="https://jkanime.net/b/">B</a></h5></div>` +
		`<div class="anime__item"><div data-setbg=" https://cdn.example/c.jpg "></div><h5><a href="https://jkanime.net/c/">C</a></h5></div>`
	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(page))
	}))
	t.Cleanup(srv.Close)
	searcher := newSearcherWithBaseURL(srv.Client(), srv.URL)

	results, err := searcher.Search(context.Background(), "a")
	if err != nil {
		t.Fatalf("Search: %v", err)
	}

	got := make([]string, 0, len(results))
	for _, r := range results {
		got = append(got, r.Title+"="+r.ImageURL)
	}
	if want := []string{"A=https://cdn.example/a.jpg", "B=", "C=https://cdn.example/c.jpg"}; !slices.Equal(got, want) {
		t.Fatalf("covers = %q, want %q", got, want)
	}
}

func TestSearcherReturnsEmptyOnNoResults(t *testing.T) {
	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
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
	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

// TestSearcherNeverPutsAPathSeparatorInTheQuery pins the live failure: a name
// whose own separator was escaped into a single path segment made the site
// answer 404 without ever reaching its search (validated live 2026-10-13). The
// route owns exactly three separators, so the query must arrive with none of its
// own, and the name itself must survive the rewrite.
func TestSearcherNeverPutsAPathSeparatorInTheQuery(t *testing.T) {
	var gotRequestURI, gotPath string
	srv := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRequestURI, gotPath = r.RequestURI, r.URL.Path
		_, _ = w.Write([]byte(`<html></html>`))
	}))
	t.Cleanup(srv.Close)
	searcher := newSearcherWithBaseURL(srv.Client(), srv.URL)

	if _, err := searcher.Search(context.Background(), "Ranma 1/2 (2024) 3rd Season"); err != nil {
		t.Fatalf("Search: %v", err)
	}

	if strings.Contains(strings.ToLower(gotRequestURI), "%2f") {
		t.Fatalf("search request still carries an escaped path separator: %s", gotRequestURI)
	}
	// The exact decoded path is pinned because it is the form validated live
	// against the site. Replacing the separator with nothing instead of a space
	// would join the name's digits into a query nobody has ever verified, so
	// changing this string must be a deliberate act.
	if want := "/buscar/Ranma 1 2 (2024) 3rd Season/"; gotPath != want {
		t.Fatalf("unexpected decoded search path: got %q want %q", gotPath, want)
	}
}
