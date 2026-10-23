package jkanime

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// searchResultPattern matches one result's title + anime page URL in the
// jkanime `/buscar/{query}/` HTML: `<h5><a href="{pageURL}">{Title}</a></h5>`.
// Validated live 2026-07-05 (GET /buscar/dr%20stone/ → 8 franchise entries).
// Isolated as a package-level regex so a future template change updates one place.
var searchResultPattern = regexp.MustCompile(`(?s)<h5>\s*<a\s+href="([^"]+)"\s*>(.*?)</a>\s*</h5>`)

// searchCoverPattern matches a result's cover, which jkanime lazy-loads from
// `data-setbg="{imageURL}"` on the picture ahead of the result's `<h5>`.
var searchCoverPattern = regexp.MustCompile(`data-setbg="([^"]*)"`)

// SearchResult is one anime returned by a jkanime name search. ImageURL is
// empty when the result carries no cover.
type SearchResult struct {
	Title    string
	PageURL  string
	ImageURL string
}

// Searcher performs name→anime-page lookups against jkanime's `/buscar/` page.
// It is separate from the EpisodeSource Adapter: search is a season-workflow
// capability, not part of the download episode-listing contract.
type Searcher struct {
	client *http.Client
	hosts  hostChain
}

// NewSearcher returns a Searcher using the given HTTP client.
func NewSearcher(client *http.Client) *Searcher {
	return newSearcherWithBaseURL(client, defaultBaseURLs...)
}

// newSearcherWithBaseURL is the test seam: it lets tests point the host chain
// at httptest.Servers while exercising the real extraction path.
func newSearcherWithBaseURL(client *http.Client, baseURLs ...string) *Searcher {
	if client == nil {
		client = http.DefaultClient
	}
	return &Searcher{client: client, hosts: newHostChain(baseURLs)}
}

// searchQuerySeparator replaces a name's own path separator before the query is
// escaped into the single path segment the /buscar/ route owns. Escaping the
// separator is NOT enough: the site decodes %2F and routes on hierarchy, so
// /buscar/Ranma%201%2F2%20.../ answers 404 without ever reaching the search
// (validated live 2026-10-13, where the same name with a space returned the
// correct entry). Escaping guarantees syntax, not meaning, so the separator is
// removed from the query instead of escaped. match.Normalize drops every
// non-alphanumeric character before scoring, so the rewrite costs the matcher
// nothing.
const searchQuerySeparator = " "

// toSearchQuery folds a raw name into a query safe to sit inside one path
// segment.
func toSearchQuery(query string) string {
	return strings.ReplaceAll(query, "/", searchQuerySeparator)
}

// Search fetches the `/buscar/{query}/` page and returns the parsed results in
// document order. An empty result set (no matches) is returned as an empty
// slice, not an error. A Cloudflare challenge moves the search to the next host
// of the chain, and a mirror answers with links on its own host, so every
// result URL is rewritten onto jkanime.net: the stored anime page identity
// never depends on which host answered.
func (s *Searcher) Search(ctx context.Context, query string) (results []SearchResult, err error) {
	path := "/buscar/" + url.PathEscape(toSearchQuery(query)) + "/"
	err = s.hosts.try(s.hosts[0]+path, func(_, searchURL string) (err error) {
		results, err = s.searchOn(ctx, query, searchURL)
		return err
	})
	for i := range results {
		results[i].PageURL = canonicalPageURL(results[i].PageURL)
	}
	return results, err
}

// searchOn fetches one search page URL and parses its results.
func (s *Searcher) searchOn(ctx context.Context, query, searchURL string) (results []SearchResult, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build jkanime search request: %w", err)
	}
	req.Header.Set("User-Agent", searchUserAgent)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("jkanime search %q: %w", query, err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); err == nil && closeErr != nil {
			results = nil
			err = fmt.Errorf("close jkanime search body: %w", closeErr)
		}
	}()
	if isChallenge(resp) {
		return nil, fmt.Errorf("jkanime search %q: status %d: %w", query, resp.StatusCode, errChallenged)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jkanime search %q: status %d", query, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read jkanime search body: %w", err)
	}

	return parseSearchResults(string(body)), nil
}

// parseSearchResults reads every result in document order. A result's cover is
// the last one between the previous result's title and its own, so a result
// without a cover never borrows a neighbour's.
func parseSearchResults(page string) []SearchResult {
	matches := searchResultPattern.FindAllStringSubmatchIndex(page, -1)
	results := make([]SearchResult, 0, len(matches))
	previousEnd := 0
	for _, m := range matches {
		imageURL := lastCover(page[previousEnd:m[0]])
		previousEnd = m[1]
		title := strings.TrimSpace(page[m[4]:m[5]])
		pageURL := strings.TrimSpace(page[m[2]:m[3]])
		if title == "" || pageURL == "" {
			continue
		}
		results = append(results, SearchResult{Title: title, PageURL: pageURL, ImageURL: imageURL})
	}
	return results
}

// lastCover returns the last cover URL in segment, or "" when it has none.
func lastCover(segment string) string {
	covers := searchCoverPattern.FindAllStringSubmatch(segment, -1)
	if len(covers) == 0 {
		return ""
	}
	return strings.TrimSpace(covers[len(covers)-1][1])
}

// searchUserAgent is a desktop UA; jkanime's search page is server-rendered and
// returns an empty body to an unset UA (validated 2026-07-05).
const searchUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
