package jkanime

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"sync"
	"testing"
)

// paginatedEpisodesFixture builds one page of the recorded jkanime AJAX envelope. The
// real endpoint answers with a Laravel paginator (recorded live from anime 4640 on
// 2026-08-09): `per_page` is 16, `total` counts every episode across ALL pages rather
// than this page's entries, and `last_page` is the only field that says whether more
// pages exist.
func paginatedEpisodesFixture(currentPage, lastPage, total int, numbers ...int) string {
	entries := make([]string, 0, len(numbers))
	for _, number := range numbers {
		entries = append(entries, fmt.Sprintf(`{"id":%d,"number":%d,"title":"Some Anime - %d"}`, 70000+number, number, number))
	}
	return fmt.Sprintf(
		`{"current_page":%d,"data":[%s],"last_page":%d,"per_page":16,"total":%d}`,
		currentPage, strings.Join(entries, ","), lastPage, total,
	)
}

// episodeNumbers returns the inclusive episode range [from, to].
func episodeNumbers(from, to int) []int {
	numbers := make([]int, 0, to-from+1)
	for number := from; number <= to; number++ {
		numbers = append(numbers, number)
	}
	return numbers
}

// pageRecorder records the AJAX listing pages an adapter actually requested. The
// httptest handler runs on its own goroutine, so the slice is mutex-guarded.
type pageRecorder struct {
	mu        sync.Mutex
	requested []string
}

// record appends one requested listing page.
func (r *pageRecorder) record(page string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.requested = append(r.requested, page)
}

// walked returns the recorded page sequence.
func (r *pageRecorder) walked() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.requested...)
}

// newPaginatedEpisodeListingServer serves the anime page plus one AJAX fixture per
// listing page, keyed by page number. A page absent from the map fails the test loudly
// instead of answering, so "the adapter walked further than it should" is a failure and
// never a silent 404.
func newPaginatedEpisodeListingServer(t *testing.T, pages map[string]string) (*httptest.Server, *pageRecorder) {
	t.Helper()
	recorder := &pageRecorder{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/ajax/episodes/") {
			if _, err := fmt.Fprint(w, animePageWithTokensFixture); err != nil {
				t.Errorf("write anime page fixture: %v", err)
			}
			return
		}

		page := path.Base(r.URL.Path)
		recorder.record(page)
		fixture, ok := pages[page]
		if !ok {
			t.Errorf("adapter requested unexpected AJAX listing page %q", page)
			http.Error(w, "unexpected page", http.StatusNotFound)
			return
		}
		if _, err := fmt.Fprint(w, fixture); err != nil {
			t.Errorf("write AJAX fixture for page %s: %v", page, err)
		}
	}))
	return srv, recorder
}

// Regression, 2026-08-09 scheduled run: jkanime pages its AJAX episode listing at 16
// entries. Reading only page 1 reported "latest online 16" for an anime whose episode 17
// sat on page 2, so the run logged a false up_to_date and never downloaded it.
func TestListEpisodesFollowsPaginationToTheHighestEpisode(t *testing.T) {
	t.Parallel()

	srv, recorder := newPaginatedEpisodeListingServer(t, map[string]string{
		"1": paginatedEpisodesFixture(1, 2, 17, episodeNumbers(1, 16)...),
		"2": paginatedEpisodesFixture(2, 2, 17, 17),
	})
	defer srv.Close()

	listing, err := newWithBaseURL(srv.Client(), srv.URL).ListEpisodes(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("ListEpisodes: %v", err)
	}

	if listing.LatestEpisode != 17 {
		t.Fatalf("LatestEpisode = %d, want 17 (episode 17 lives on AJAX page 2)", listing.LatestEpisode)
	}
	if want := srv.URL + "/17/"; listing.EpisodePageURL != want {
		t.Fatalf("EpisodePageURL = %q, want %q", listing.EpisodePageURL, want)
	}
	if walked := recorder.walked(); len(walked) != 2 || walked[0] != "1" || walked[1] != "2" {
		t.Fatalf("walked pages = %v, want [1 2]", walked)
	}
}

// A single-page listing must stop after page 1: walking past last_page would cost an
// extra request per anime on every run.
func TestListEpisodesStopsAtTheLastPage(t *testing.T) {
	t.Parallel()

	srv, recorder := newPaginatedEpisodeListingServer(t, map[string]string{
		"1": paginatedEpisodesFixture(1, 1, 4, 1, 2, 4),
	})
	defer srv.Close()

	listing, err := newWithBaseURL(srv.Client(), srv.URL).ListEpisodes(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("ListEpisodes: %v", err)
	}

	if listing.LatestEpisode != 4 {
		t.Fatalf("LatestEpisode = %d, want 4", listing.LatestEpisode)
	}
	if walked := recorder.walked(); len(walked) != 1 || walked[0] != "1" {
		t.Fatalf("walked pages = %v, want [1]", walked)
	}
}

// fetchEpisodes aggregates every page, and `total` stays the paginator's across-pages
// count rather than the last page's entry count.
func TestFetchEpisodesAggregatesEveryPaginatedPage(t *testing.T) {
	t.Parallel()

	srv, _ := newPaginatedEpisodeListingServer(t, map[string]string{
		"1": paginatedEpisodesFixture(1, 3, 33, episodeNumbers(1, 16)...),
		"2": paginatedEpisodesFixture(2, 3, 33, episodeNumbers(17, 32)...),
		"3": paginatedEpisodesFixture(3, 3, 33, 33),
	})
	defer srv.Close()

	episodes, total, err := newWithBaseURL(srv.Client(), srv.URL).fetchEpisodes(context.Background(), "555", "tok")
	if err != nil {
		t.Fatalf("fetchEpisodes: %v", err)
	}

	if len(episodes) != 33 {
		t.Fatalf("expected 33 aggregated episodes, got %d", len(episodes))
	}
	if total != 33 {
		t.Fatalf("expected total=33, got %d", total)
	}
	if episodes[len(episodes)-1].Number != 33 {
		t.Fatalf("expected the last aggregated episode to be 33, got %d", episodes[len(episodes)-1].Number)
	}
}

// An exhausted page ends the walk even when last_page disagrees. Recorded live on
// 2026-08-09: requesting page 3 of a 2-page listing answers `"data":[]` with the same
// `"last_page":2`, so a drifted or inflated last_page must never keep the walk going.
func TestFetchEpisodesStopsOnAnExhaustedPageDespiteAnInflatedLastPage(t *testing.T) {
	t.Parallel()

	srv, recorder := newPaginatedEpisodeListingServer(t, map[string]string{
		"1": paginatedEpisodesFixture(1, 5, 16, episodeNumbers(1, 16)...),
		"2": paginatedEpisodesFixture(2, 5, 16),
	})
	defer srv.Close()

	episodes, _, err := newWithBaseURL(srv.Client(), srv.URL).fetchEpisodes(context.Background(), "555", "tok")
	if err != nil {
		t.Fatalf("fetchEpisodes: %v", err)
	}

	if len(episodes) != 16 {
		t.Fatalf("expected 16 episodes, got %d", len(episodes))
	}
	if walked := recorder.walked(); len(walked) != 2 {
		t.Fatalf("walked pages = %v, want the walk to stop on the exhausted page 2", walked)
	}
}

// A last_page that never ends must still terminate: without the page cap this walk
// requests pages until the context or the site gives up.
func TestFetchEpisodesStopsAtThePageCapWhenLastPageNeverEnds(t *testing.T) {
	t.Parallel()

	recorder := &pageRecorder{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page := path.Base(r.URL.Path)
		recorder.record(page)
		if _, err := fmt.Fprint(w, paginatedEpisodesFixture(1, 999999, 999999, 1)); err != nil {
			t.Errorf("write AJAX fixture: %v", err)
		}
	}))
	defer srv.Close()

	if _, _, err := newWithBaseURL(srv.Client(), srv.URL).fetchEpisodes(context.Background(), "555", "tok"); err != nil {
		t.Fatalf("fetchEpisodes: %v", err)
	}

	// The expected count is a LITERAL, deliberately not `maxEpisodeListingPages`. Asserting
	// against the constant moves both sides of the comparison together, so the test passes
	// for any cap and pins nothing -- mutation testing caught exactly that. Changing the cap
	// must be a deliberate act that updates this number too.
	const wantCappedPages = 100
	if walked := recorder.walked(); len(walked) != wantCappedPages {
		t.Fatalf("walked %d pages, want the walk capped at %d", len(walked), wantCappedPages)
	}
}

// A page that fails mid-walk MUST be loud. Returning the pages already collected would
// under-report the latest episode -- the exact silent truncation this walk exists to
// prevent.
func TestFetchEpisodesFailsLoudlyWhenALaterPageFails(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if path.Base(r.URL.Path) == "2" {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		if _, err := fmt.Fprint(w, paginatedEpisodesFixture(1, 2, 17, episodeNumbers(1, 16)...)); err != nil {
			t.Errorf("write AJAX fixture: %v", err)
		}
	}))
	defer srv.Close()

	episodes, total, err := newWithBaseURL(srv.Client(), srv.URL).fetchEpisodes(context.Background(), "555", "tok")
	if err == nil {
		t.Fatal("expected a loud error when a later listing page fails")
	}
	if len(episodes) != 0 || total != 0 {
		t.Fatalf("expected no partial listing alongside the error, got %d episodes / total %d", len(episodes), total)
	}
}
