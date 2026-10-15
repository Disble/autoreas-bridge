package season

import (
	"context"
	"errors"
	"slices"
	"testing"

	"autoreas-bridge/internal/season/match"
)

// errProviderDown is the failure a provider fake reports in these tests.
var errProviderDown = errors.New("provider down")

// providerFake builds one named provider whose searcher answers query with
// candidates, or fails with err when err is set.
func providerFake(name, query string, err error, candidates ...match.Candidate) ProviderSearcher {
	return ProviderSearcher{Provider: name, Searcher: &fakeSearcher{byQuery: map[string][]match.Candidate{query: candidates}, err: err}}
}

// page is a short constructor for one expected provider page.
func page(title, pageURL, provider string) ProviderPage {
	return ProviderPage{Title: title, PageURL: pageURL, Provider: provider}
}

// TestServiceSearchProviders pins the provider search: every configured
// provider is asked, every returned page comes back tagged with its provider
// and ranked by similarity to the query (stable on ties, no display floor), a
// partial failure still returns the pages that were found, and only a total
// failure is an error. A blank query sends no request at all.
func TestServiceSearchProviders(t *testing.T) {
	t.Parallel()
	starmyu := match.Candidate{Title: "Starmyu 2nd Season", PageURL: "https://jkanime.net/starmyu-2/"}
	aoAshi2 := match.Candidate{Title: "Ao Ashi Season 2", PageURL: "https://jkanime.net/ao-ashi-2/"}
	aoAshi := match.Candidate{Title: "Ao Ashi", PageURL: "https://other.example/ao-ashi/"}
	twin := match.Candidate{Title: "Ao Ashi", PageURL: "https://jkanime.net/ao-ashi/"}
	cases := []struct {
		name      string
		query     string
		providers []ProviderSearcher
		want      []ProviderPage
		wantErr   error
		wantCalls int
	}{
		{
			name:  "ranks every page of every provider and keeps unrelated ones",
			query: "Ao Ashi",
			providers: []ProviderSearcher{
				providerFake("jkanime", "Ao Ashi", nil, starmyu, aoAshi2),
				providerFake("other", "Ao Ashi", nil, aoAshi),
			},
			want: []ProviderPage{
				page("Ao Ashi", "https://other.example/ao-ashi/", "other"),
				page("Ao Ashi Season 2", "https://jkanime.net/ao-ashi-2/", "jkanime"),
				page("Starmyu 2nd Season", "https://jkanime.net/starmyu-2/", "jkanime"),
			},
			wantCalls: 2,
		},
		{
			name:  "equal scores keep the provider order",
			query: "Ao Ashi",
			providers: []ProviderSearcher{
				providerFake("jkanime", "Ao Ashi", nil, twin),
				providerFake("other", "Ao Ashi", nil, aoAshi),
			},
			want: []ProviderPage{
				page("Ao Ashi", "https://jkanime.net/ao-ashi/", "jkanime"),
				page("Ao Ashi", "https://other.example/ao-ashi/", "other"),
			},
			wantCalls: 2,
		},
		{
			name:  "a failing provider does not hide the others",
			query: "Ao Ashi",
			providers: []ProviderSearcher{
				providerFake("broken", "Ao Ashi", errProviderDown),
				providerFake("jkanime", "Ao Ashi", nil, aoAshi2),
			},
			want:      []ProviderPage{page("Ao Ashi Season 2", "https://jkanime.net/ao-ashi-2/", "jkanime")},
			wantCalls: 2,
		},
		{
			name:  "every provider failing is an error",
			query: "Ao Ashi",
			providers: []ProviderSearcher{
				providerFake("broken", "Ao Ashi", errProviderDown),
				providerFake("also-broken", "Ao Ashi", errProviderDown),
			},
			wantErr:   errProviderDown,
			wantCalls: 2,
		},
		{
			name:      "a provider with no pages is an empty result, not an error",
			query:     "Ao Ashi",
			providers: []ProviderSearcher{providerFake("jkanime", "Ao Ashi", nil)},
			want:      []ProviderPage{},
			wantCalls: 1,
		},
		{
			name:      "a blank query sends no request",
			query:     "  \t ",
			providers: []ProviderSearcher{providerFake("jkanime", "  \t ", nil, aoAshi)},
			want:      []ProviderPage{},
		},
		{
			name:    "no configured provider is unavailable",
			query:   "Ao Ashi",
			wantErr: ErrSearcherUnavailable,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			svc := newTestService(newFakeRepo())
			svc.SetProviderSearchers(tc.providers)

			got, err := svc.SearchProviders(context.Background(), tc.query)

			if !errors.Is(err, tc.wantErr) || (tc.wantErr == nil) != (err == nil) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if !slices.Equal(got, tc.want) || (got == nil) != (tc.want == nil) {
				t.Fatalf("pages = %#v, want %#v", got, tc.want)
			}
			calls := 0
			for _, p := range tc.providers {
				calls += p.Searcher.(*fakeSearcher).calls
			}
			if calls != tc.wantCalls {
				t.Fatalf("provider requests = %d, want %d", calls, tc.wantCalls)
			}
		})
	}
}
