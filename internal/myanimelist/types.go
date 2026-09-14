// Package myanimelist retrieves anime metadata from MyAnimeList, speaking
// only MyAnimeList's own vocabulary (e.g. "Type: TV", "Source: Manga"). It
// has no knowledge of the anime editor's domain vocabulary, and MUST NOT
// import internal/anime or internal/api/contracts (design D5) — the
// MAL-to-bridge vocabulary translation lives entirely outside this
// package, in frontend/src/shared/metadata-lookup and each feature's own
// mapping hop.
//
// Retrieval is two-stage: Search runs per keystroke against MyAnimeList's
// prefix-search endpoint and never fetches an anime detail page; Detail
// fetches the confirmed candidate's page and is the only place this
// package performs a second request.
package myanimelist

import "context"

// Candidate is one search result card, in MyAnimeList's own vocabulary.
type Candidate struct {
	// ID is MyAnimeList's numeric anime id.
	ID int
	// Name is the candidate's display title as MyAnimeList returns it.
	Name string
	// Image is the candidate's cover image URL, taken from the search
	// payload so no extra fetch is needed to resolve a cover.
	Image string
	// MediaType is MyAnimeList's raw media type string (e.g. "TV",
	// "Movie", "OVA"), unmapped.
	MediaType string
	// StartYear is the year MyAnimeList reports the anime started airing.
	StartYear int
	// Score is MyAnimeList's raw score string (e.g. "8.98"), kept as text
	// because MyAnimeList itself renders it as text and this package
	// never performs arithmetic on it.
	Score string
}

// SearchResult is the outcome of a search-stage query. A search that
// matches nothing returns a SearchResult with an empty Candidates slice —
// never an error (myanimelist-metadata-source spec, "Zero search results
// is not an error").
type SearchResult struct {
	Candidates []Candidate
}

// Detail is a fully parsed anime detail page, in MyAnimeList's own
// vocabulary. A field left empty because it was legitimately absent from
// the page is named in Unfilled rather than defaulted; a field present but
// in an unrecognized shape is reported as a *DriftError instead of ever
// reaching this struct with a silently wrong value (design D2's "third
// outcome").
type Detail struct {
	Title    string
	Type     string
	Episodes string
	Duration string
	Source   string
	Studios  []string
	Genres   []string
	// Unfilled names every optional field that was legitimately absent
	// from the page.
	Unfilled []string
}

// Fetcher downloads a URL's raw response body over HTTP(S), honouring ctx
// cancellation. The default production adapter is httpClient
// (client.go), mirroring internal/anime/cover's Fetcher port.
type Fetcher interface {
	Fetch(ctx context.Context, url string) (body []byte, err error)
}
