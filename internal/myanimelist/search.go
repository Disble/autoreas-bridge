package myanimelist

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// defaultBaseURL is MyAnimeList's production host.
const defaultBaseURL = "https://myanimelist.net"

// Client retrieves anime metadata from MyAnimeList in two stages: Search
// (prefix.json, one request per confirmed query, see search.go) and Detail
// (the anime page, fetched only after the caller supplies an explicitly
// confirmed candidate id, see detail.go) — the
// myanimelist-metadata-source spec's "Two-stage retrieval" requirement.
type Client struct {
	fetch   Fetcher
	baseURL string
}

// NewClient constructs a Client. baseURL == "" falls back to
// defaultBaseURL; tests pass an httptest.Server URL instead.
func NewClient(fetch Fetcher, baseURL string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return &Client{fetch: fetch, baseURL: baseURL}
}

// searchResponse mirrors MyAnimeList's prefix.json shape closely enough to
// decode it; fields this client never reads are left out entirely.
type searchResponse struct {
	Categories []struct {
		Items []struct {
			ID       int    `json:"id"`
			Name     string `json:"name"`
			ImageURL string `json:"image_url"`
			Payload  struct {
				MediaType string `json:"media_type"`
				StartYear int    `json:"start_year"`
				Score     string `json:"score"`
			} `json:"payload"`
		} `json:"items"`
	} `json:"categories"`
}

// Search queries MyAnimeList's prefix-search endpoint for anime matching
// query and returns the candidate cards it finds. It performs exactly one
// request — there is no retry and no zero-result fallback strategy
// (design D11). A zero-result search is not an error: it returns a
// SearchResult with an empty Candidates slice.
func (c *Client) Search(ctx context.Context, query string) (SearchResult, error) {
	searchURL := fmt.Sprintf("%s/search/prefix.json?type=anime&keyword=%s&v=1", c.baseURL, url.QueryEscape(query))

	body, err := c.fetch.Fetch(ctx, searchURL)
	if err != nil {
		return SearchResult{}, fmt.Errorf("myanimelist: search %q: %w", query, err)
	}

	var raw searchResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return SearchResult{}, fmt.Errorf("myanimelist: decode search response for %q: %w", query, err)
	}

	var candidates []Candidate
	for _, category := range raw.Categories {
		for _, item := range category.Items {
			candidates = append(candidates, Candidate{
				ID:        item.ID,
				Name:      item.Name,
				Image:     originalImageURL(item.ImageURL),
				MediaType: item.Payload.MediaType,
				StartYear: item.Payload.StartYear,
				Score:     item.Payload.Score,
			})
		}
	}

	return SearchResult{Candidates: candidates}, nil
}

// cdnHost is the MyAnimeList image CDN whose resize prefix originalImageURL
// strips.
const cdnHost = "cdn.myanimelist.net"

// resizeSegment matches the size segment of the CDN's /r/<W>x<H>/ prefix.
var resizeSegment = regexp.MustCompile(`^[0-9]+x[0-9]+$`)

// originalImageURL rewrites a CDN-resized image URL
// (https://cdn.myanimelist.net/r/116x180/images/...jpg?s=<sig>) to the
// original image it was derived from, dropping the resize signature. The
// search payload only offers the resized variant, but its on-the-fly resize
// service fails independently of the originals (measured: 504 on /r/ while
// /images/ answered 200), and the cover pipeline (ADR-024) derives its own
// thumbnail anyway. Any other URL is returned unchanged.
func originalImageURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host != cdnHost {
		return raw
	}
	segments := strings.SplitN(parsed.Path, "/", 4)
	if len(segments) != 4 || segments[1] != "r" || !resizeSegment.MatchString(segments[2]) || segments[3] == "" {
		return raw
	}
	parsed.Path = "/" + segments[3]
	parsed.RawPath = ""
	parsed.RawQuery = ""
	return parsed.String()
}
