package desktop

import (
	"context"
	"net/http"

	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/season/match"
)

// jkanimeNameSearcher adapts the jkanime search adapter to the season
// NameSearcher port at the composition root, so the season context never
// imports the download/jkanime package (anti-corruption boundary).
type jkanimeNameSearcher struct {
	searcher *jkanime.Searcher
}

// newJkanimeNameSearcher builds the adapter over a default HTTP client.
func newJkanimeNameSearcher() jkanimeNameSearcher {
	return jkanimeNameSearcher{searcher: jkanime.NewSearcher(http.DefaultClient)}
}

// Search runs a jkanime name search and maps the results to match.Candidate.
func (a jkanimeNameSearcher) Search(ctx context.Context, query string) ([]match.Candidate, error) {
	results, err := a.searcher.Search(ctx, query)
	if err != nil {
		return nil, err
	}
	out := make([]match.Candidate, 0, len(results))
	for _, r := range results {
		out = append(out, match.Candidate{Title: r.Title, PageURL: r.PageURL})
	}
	return out, nil
}
