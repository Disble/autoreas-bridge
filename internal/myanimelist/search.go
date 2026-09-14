package myanimelist

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
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
				Image:     item.ImageURL,
				MediaType: item.Payload.MediaType,
				StartYear: item.Payload.StartYear,
				Score:     item.Payload.Score,
			})
		}
	}

	return SearchResult{Candidates: candidates}, nil
}
