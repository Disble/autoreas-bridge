package desktop

import (
	"context"
	"net/http"

	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/season"
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
		out = append(out, match.Candidate{Title: r.Title, PageURL: r.PageURL, ImageURL: r.ImageURL})
	}
	return out, nil
}

// newSeasonProviderSearchers lists the download providers the intake's manual
// "Find on provider" search asks, each named by its site descriptor so the
// frontend shows the same name the download registry uses. jkanime is the
// only provider today; a new site adds its own entry here.
func newSeasonProviderSearchers(jkanimeSearcher season.NameSearcher) []season.ProviderSearcher {
	return []season.ProviderSearcher{
		{Provider: jkanime.New(nil).Descriptor().Name, Searcher: jkanimeSearcher},
	}
}

// SearchSeasonProviders searches every download provider for query and
// returns every page they returned, ranked by similarity and tagged with
// their provider. Status is "ok" or the failure message; Pages is never nil.
// A read: it changes nothing and broadcasts nothing.
func (a *App) SearchSeasonProviders(query string) SeasonProviderSearchDTO {
	if a.seasonService == nil {
		return SeasonProviderSearchDTO{Status: seasonServiceUnavailableMessage, Pages: []SeasonProviderPageDTO{}}
	}
	pages, err := a.seasonService.SearchProviders(a.seasonCtx(), query)
	if err != nil {
		return SeasonProviderSearchDTO{Status: err.Error(), Pages: []SeasonProviderPageDTO{}}
	}
	out := make([]SeasonProviderPageDTO, 0, len(pages))
	for _, p := range pages {
		out = append(out, SeasonProviderPageDTO{Title: p.Title, PageURL: p.PageURL, Provider: p.Provider, ImageURL: p.ImageURL})
	}
	return SeasonProviderSearchDTO{Status: "ok", Pages: out}
}
