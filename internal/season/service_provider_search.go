package season

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"autoreas-bridge/internal/season/match"
)

// ProviderSearcher is one download provider the manual "find on provider"
// search asks: the provider's display name (its site descriptor name, wired at
// the composition root) and the searcher that queries it.
type ProviderSearcher struct {
	Provider string
	Searcher NameSearcher
}

// ProviderPage is one anime page a provider returned for a manual search,
// tagged with the provider that returned it. ImageURL is the cover the
// provider showed for it, empty when it had none.
type ProviderPage struct {
	Title    string
	PageURL  string
	Provider string
	ImageURL string
}

// SetProviderSearchers wires the providers SearchProviders asks, in display
// order (the order equal-scored pages keep). It is separate from the matching
// NameSearcher on purpose: RunMatching keeps its single-searcher behavior.
func (s *Service) SetProviderSearchers(providers []ProviderSearcher) {
	s.providers = providers
}

// SearchProviders asks every configured provider for query and returns every
// page they returned, ranked by similarity to query (descending, stable on
// ties). There is deliberately no display floor: the user picks the page, so
// nothing a provider returned is hidden. A blank query sends no request and
// returns no pages. A failing provider is skipped while another answered;
// only when every provider failed is the joined failure returned.
func (s *Service) SearchProviders(ctx context.Context, query string) ([]ProviderPage, error) {
	if strings.TrimSpace(query) == "" {
		return []ProviderPage{}, nil
	}
	if len(s.providers) == 0 {
		return nil, ErrSearcherUnavailable
	}
	pages := []ProviderPage{}
	var failures []error
	for _, provider := range s.providers {
		candidates, err := provider.Searcher.Search(ctx, query)
		if err != nil {
			failures = append(failures, fmt.Errorf("%s search: %w", provider.Provider, err))
			continue
		}
		for _, c := range candidates {
			pages = append(pages, ProviderPage{Title: c.Title, PageURL: c.PageURL, Provider: provider.Provider, ImageURL: c.ImageURL})
		}
	}
	if len(failures) == len(s.providers) {
		return nil, errors.Join(failures...)
	}
	return rankProviderPages(query, pages), nil
}

// rankProviderPages orders pages by their title's similarity to query, most
// similar first, keeping the provider order among equal scores.
func rankProviderPages(query string, pages []ProviderPage) []ProviderPage {
	type scoredPage struct {
		page  ProviderPage
		score float64
	}
	normalized := match.Normalize(query)
	scored := make([]scoredPage, 0, len(pages))
	for _, p := range pages {
		scored = append(scored, scoredPage{page: p, score: match.Score(normalized, match.Normalize(p.Title))})
	}
	slices.SortStableFunc(scored, func(a, b scoredPage) int { return cmp.Compare(b.score, a.score) })
	ranked := make([]ProviderPage, 0, len(scored))
	for _, s := range scored {
		ranked = append(ranked, s.page)
	}
	return ranked
}
