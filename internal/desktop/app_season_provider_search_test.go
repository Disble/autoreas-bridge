package desktop

import (
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"testing"

	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/match"
)

// TestSearchSeasonProvidersBinding pins the Wails provider search: the ranked
// pages of every provider reach the frontend tagged with their provider under
// status "ok", a total failure surfaces its message with an empty page list,
// and an unwired service reports itself unavailable. Pages is never nil, so
// the frontend never receives a null collection.
func TestSearchSeasonProvidersBinding(t *testing.T) {
	t.Parallel()
	pages := map[string][]match.Candidate{"Ao Ashi": {
		{Title: "Starmyu 2nd Season", PageURL: "https://jkanime.net/starmyu-2/"},
		{Title: "Ao Ashi", PageURL: "https://jkanime.net/ao-ashi/", ImageURL: "https://cdn.example/ao-ashi.jpg"},
	}}
	cases := []struct {
		name      string
		providers []season.ProviderSearcher
		noService bool
		want      SeasonProviderSearchDTO
	}{
		{
			name:      "ranked pages carry their provider",
			providers: []season.ProviderSearcher{{Provider: "jkanime", Searcher: fakeAppNameSearcher{byQuery: pages}}},
			want: SeasonProviderSearchDTO{Status: "ok", Pages: []SeasonProviderPageDTO{
				{Title: "Ao Ashi", PageURL: "https://jkanime.net/ao-ashi/", Provider: "jkanime", ImageURL: "https://cdn.example/ao-ashi.jpg"},
				{Title: "Starmyu 2nd Season", PageURL: "https://jkanime.net/starmyu-2/", Provider: "jkanime"},
			}},
		},
		{
			name:      "every provider failing reports the failure",
			providers: []season.ProviderSearcher{{Provider: "jkanime", Searcher: fakeAppNameSearcher{err: errors.New("site down")}}},
			want:      SeasonProviderSearchDTO{Status: "jkanime search: site down", Pages: []SeasonProviderPageDTO{}},
		},
		{
			name:      "no season service is unavailable",
			noService: true,
			want:      SeasonProviderSearchDTO{Status: seasonServiceUnavailableMessage, Pages: []SeasonProviderPageDTO{}},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := newTestSeasonApp(newFakeSeasonRepo(), nil)
			app.seasonService.SetProviderSearchers(tc.providers)
			if tc.noService {
				app.seasonService = nil
			}

			got := app.SearchSeasonProviders("Ao Ashi")

			if got.Status != tc.want.Status || !slices.Equal(got.Pages, tc.want.Pages) || got.Pages == nil {
				t.Fatalf("SearchSeasonProviders = %#v, want %#v", got, tc.want)
			}
		})
	}
}

// TestSeasonProviderSearchDTOJSONFields pins the wire names the frontend's
// provider search modal reads.
func TestSeasonProviderSearchDTOJSONFields(t *testing.T) {
	t.Parallel()
	raw, err := json.Marshal(SeasonProviderSearchDTO{Pages: []SeasonProviderPageDTO{{}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded struct {
		Status *string          `json:"status"`
		Pages  []map[string]any `json:"pages"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.Status == nil || len(decoded.Pages) != 1 {
		t.Fatalf("result fields = %s, want status and pages", raw)
	}
	keys := make([]string, 0, len(decoded.Pages[0]))
	for key := range decoded.Pages[0] {
		keys = append(keys, key)
	}
	if slices.Sort(keys); !slices.Equal(keys, []string{"imageUrl", "pageUrl", "provider", "title"}) {
		t.Fatalf("page fields = %q, want imageUrl, pageUrl, provider, title", keys)
	}
}

// TestSeasonProviderSearchersNameEveryProvider pins the composition root's
// provider list: jkanime is the only provider today, named by its site
// descriptor, and its searcher is the jkanime name search adapter.
func TestSeasonProviderSearchersNameEveryProvider(t *testing.T) {
	t.Parallel()
	providers := newSeasonProviderSearchers(newJkanimeNameSearcher())
	if len(providers) != 1 || providers[0].Provider != "jkanime" {
		t.Fatalf("providers = %+v, want only jkanime", providers)
	}
	if reflect.TypeOf(providers[0].Searcher) != reflect.TypeOf(jkanimeNameSearcher{}) {
		t.Fatalf("jkanime searcher = %T, want jkanimeNameSearcher", providers[0].Searcher)
	}
}
