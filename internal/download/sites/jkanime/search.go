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

// SearchResult is one anime returned by a jkanime name search.
type SearchResult struct {
	Title   string
	PageURL string
}

// Searcher performs name→anime-page lookups against jkanime's `/buscar/` page.
// It is separate from the EpisodeSource Adapter: search is a season-workflow
// capability, not part of the download episode-listing contract.
type Searcher struct {
	client  *http.Client
	baseURL string
}

// NewSearcher returns a Searcher using the given HTTP client.
func NewSearcher(client *http.Client) *Searcher {
	return newSearcherWithBaseURL(client, defaultBaseURL)
}

// newSearcherWithBaseURL is the test seam: it lets tests point the search
// endpoint at an httptest.Server while exercising the real extraction path.
func newSearcherWithBaseURL(client *http.Client, baseURL string) *Searcher {
	if client == nil {
		client = http.DefaultClient
	}
	return &Searcher{client: client, baseURL: strings.TrimRight(baseURL, "/")}
}

// Search fetches the `/buscar/{query}/` page and returns the parsed results in
// document order. An empty result set (no matches) is returned as an empty
// slice, not an error.
func (s *Searcher) Search(ctx context.Context, query string) (results []SearchResult, err error) {
	searchURL := fmt.Sprintf("%s/buscar/%s/", s.baseURL, url.PathEscape(query))
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
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jkanime search %q: status %d", query, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read jkanime search body: %w", err)
	}

	matches := searchResultPattern.FindAllStringSubmatch(string(body), -1)
	results = make([]SearchResult, 0, len(matches))
	for _, m := range matches {
		title := strings.TrimSpace(m[2])
		pageURL := strings.TrimSpace(m[1])
		if title == "" || pageURL == "" {
			continue
		}
		results = append(results, SearchResult{Title: title, PageURL: pageURL})
	}
	return results, nil
}

// searchUserAgent is a desktop UA; jkanime's search page is server-rendered and
// returns an empty body to an unset UA (validated 2026-07-05).
const searchUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
