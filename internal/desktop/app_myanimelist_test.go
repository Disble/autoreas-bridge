package desktop

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/myanimelist"
)

// fakeMyAnimeListClient is the test double for myanimelistClientPort. It
// captures the last query/malID it received so tests can prove delegation,
// not only outcome mapping.
type fakeMyAnimeListClient struct {
	searchResult myanimelist.SearchResult
	searchErr    error
	detail       myanimelist.Detail
	detailErr    error
	lastQuery    string
	lastMalID    int
}

// Search implements myanimelistClientPort.
func (f *fakeMyAnimeListClient) Search(_ context.Context, query string) (myanimelist.SearchResult, error) {
	f.lastQuery = query
	return f.searchResult, f.searchErr
}

// Detail implements myanimelistClientPort.
func (f *fakeMyAnimeListClient) Detail(_ context.Context, malID int) (myanimelist.Detail, error) {
	f.lastMalID = malID
	return f.detail, f.detailErr
}

func TestSearchMyAnimeListReturnsErrorWhenClientUnavailable(t *testing.T) {
	app := &App{}
	got := app.SearchMyAnimeList("bleach")
	if got.Outcome != contracts.AnimePatchOutcomeError || len(got.Candidates) != 0 {
		t.Fatalf("expected explicit error when myanimelist client is unavailable, got %#v", got)
	}
}

// TestSearchMyAnimeListMapsClientOutcomeToPatchOutcome covers design D4's
// three-way outcome mapping. A zero-candidate search is AnimePatchOutcomeNoOp,
// never an error -- the empty case is deliberately distinct from the drift
// and transport-failure cases below, not a fourth "error" shape.
func TestSearchMyAnimeListMapsClientOutcomeToPatchOutcome(t *testing.T) {
	tests := []struct {
		name           string
		client         *fakeMyAnimeListClient
		wantOutcome    contracts.AnimePatchOutcome
		wantCandidates int
		wantMessageHas string
	}{
		{
			name: "candidates present maps to applied",
			client: &fakeMyAnimeListClient{searchResult: myanimelist.SearchResult{Candidates: []myanimelist.Candidate{
				{ID: 41467, Name: "Bleach: Sennen Kessen-hen"},
			}}},
			wantOutcome:    contracts.AnimePatchOutcomeApplied,
			wantCandidates: 1,
		},
		{
			name:        "zero candidates maps to no-op, never an error",
			client:      &fakeMyAnimeListClient{searchResult: myanimelist.SearchResult{}},
			wantOutcome: contracts.AnimePatchOutcomeNoOp,
		},
		{
			name:           "drift error maps to error naming the anchor",
			client:         &fakeMyAnimeListClient{searchErr: &myanimelist.DriftError{Anchor: "Type:", URL: "https://myanimelist.net/anime/1"}},
			wantOutcome:    contracts.AnimePatchOutcomeError,
			wantMessageHas: "Type:",
		},
		{
			name:        "transport failure maps to error",
			client:      &fakeMyAnimeListClient{searchErr: myanimelist.ErrUnexpectedStatus},
			wantOutcome: contracts.AnimePatchOutcomeError,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			app := &App{ctx: context.Background(), myanimelistClient: test.client}

			got := app.SearchMyAnimeList("bleach")
			if got.Outcome != test.wantOutcome {
				t.Fatalf("outcome: got %q want %q (result %#v)", got.Outcome, test.wantOutcome, got)
			}
			if got.Outcome == contracts.AnimePatchOutcomeConflict {
				t.Fatalf("conflict outcome must never be produced, got %#v", got)
			}
			if len(got.Candidates) != test.wantCandidates {
				t.Fatalf("candidates: got %d want %d", len(got.Candidates), test.wantCandidates)
			}
			if test.wantMessageHas != "" && !strings.Contains(got.Message, test.wantMessageHas) {
				t.Fatalf("message %q does not name the anchor %q", got.Message, test.wantMessageHas)
			}
		})
	}
}

// TestSearchMyAnimeListMapsCandidateFields proves the candidate mapping
// itself, separate from the outcome-mapping table above: it asserts a
// specific expected DTO value and the query actually reached the client.
func TestSearchMyAnimeListMapsCandidateFields(t *testing.T) {
	client := &fakeMyAnimeListClient{searchResult: myanimelist.SearchResult{Candidates: []myanimelist.Candidate{
		{ID: 41467, Name: "Bleach: Sennen Kessen-hen", Image: "https://cdn.myanimelist.net/images/anime/41467.jpg", MediaType: "TV", StartYear: 2022, Score: "8.98"},
	}}}
	app := &App{ctx: context.Background(), myanimelistClient: client}

	got := app.SearchMyAnimeList("Bleach: Sennen Kessen-hen")
	if len(got.Candidates) != 1 {
		t.Fatalf("expected one candidate, got %#v", got.Candidates)
	}
	want := contracts.CandidateDTO{MalID: 41467, Name: "Bleach: Sennen Kessen-hen", Image: "https://cdn.myanimelist.net/images/anime/41467.jpg", MediaType: "TV", StartYear: 2022, Score: "8.98"}
	if got.Candidates[0] != want {
		t.Fatalf("candidate mapping: got %#v want %#v", got.Candidates[0], want)
	}
	if client.lastQuery != "Bleach: Sennen Kessen-hen" {
		t.Fatalf("expected the query to reach the client, got %q", client.lastQuery)
	}
}

// TestEnsureMyAnimeListRuntimeDependenciesWiresRealClientOnce proves the
// User-Agent deviation Slice 1 flagged is closed: a bare App gets a real,
// non-nil client, and calling the wiring twice never replaces an already-set
// client (the same idempotence every other ensure*RuntimeDependencies
// default follows).
func TestEnsureMyAnimeListRuntimeDependenciesWiresRealClientOnce(t *testing.T) {
	app := &App{}
	app.ensureMyAnimeListRuntimeDependencies()
	if app.myanimelistClient == nil {
		t.Fatal("expected a real myanimelist client to be wired when none was set")
	}

	existing := app.myanimelistClient
	app.ensureMyAnimeListRuntimeDependencies()
	if app.myanimelistClient != existing {
		t.Fatal("expected an already-wired client to be left untouched")
	}
}

// TestNewMyAnimeListClientUsesADefaultTimeoutAndBodyLimitLargeEnoughForARealPage
// proves newMyAnimeListClient wires real, usable defaults rather than
// zero-value ones: an 18-byte JSON body over a real loopback round trip
// must decode successfully, which fails if the body cap truncates it (a
// maxBytes of 1 leaves an unparsable "{") or if the timeout is too short
// for any real request to complete (a timeout of one nanosecond).
func TestNewMyAnimeListClientUsesADefaultTimeoutAndBodyLimitLargeEnoughForARealPage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"categories":[]}`))
	}))
	defer server.Close()

	client := newMyAnimeListClient(server.URL)
	got, err := client.Search(context.Background(), "bleach")
	if err != nil {
		t.Fatalf("expected the default timeout/body limit to serve a real 18-byte response, got %v", err)
	}
	if len(got.Candidates) != 0 {
		t.Fatalf("expected zero candidates from an empty categories list, got %#v", got.Candidates)
	}
}

// TestMyanimelistUserAgentNamesTheRunningBridgeVersion pins the exact
// User-Agent shape the production client is built with, so it stays an
// honest, attributable identifier instead of drifting back to the
// package's dev fallback.
func TestMyanimelistUserAgentNamesTheRunningBridgeVersion(t *testing.T) {
	original := bridgeVersion
	t.Cleanup(func() { bridgeVersion = original })
	bridgeVersion = "1.12.0"

	if got, want := myanimelistUserAgent(), "autoreas-bridge/1.12.0"; got != want {
		t.Fatalf("user agent: got %q want %q", got, want)
	}
}

func TestGetMyAnimeListDetailReturnsErrorWhenClientUnavailable(t *testing.T) {
	app := &App{}
	got := app.GetMyAnimeListDetail(41467)
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Title != "" {
		t.Fatalf("expected explicit error when myanimelist client is unavailable, got %#v", got)
	}
}

// TestGetMyAnimeListDetailMapsClientOutcomeToPatchOutcome covers design D4's
// detail-side outcome mapping. Detail has no "zero candidates" shape --
// it either resolves to one page or fails.
func TestGetMyAnimeListDetailMapsClientOutcomeToPatchOutcome(t *testing.T) {
	tests := []struct {
		name           string
		client         *fakeMyAnimeListClient
		wantOutcome    contracts.AnimePatchOutcome
		wantMessageHas string
	}{
		{
			name:        "detail present maps to applied",
			client:      &fakeMyAnimeListClient{detail: myanimelist.Detail{Title: "Bleach", Type: "TV"}},
			wantOutcome: contracts.AnimePatchOutcomeApplied,
		},
		{
			name:           "drift error maps to error naming the anchor",
			client:         &fakeMyAnimeListClient{detailErr: &myanimelist.DriftError{Anchor: "Duration:", URL: "https://myanimelist.net/anime/41467"}},
			wantOutcome:    contracts.AnimePatchOutcomeError,
			wantMessageHas: "Duration:",
		},
		{
			name:        "transport failure maps to error",
			client:      &fakeMyAnimeListClient{detailErr: myanimelist.ErrNotFound},
			wantOutcome: contracts.AnimePatchOutcomeError,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			app := &App{ctx: context.Background(), myanimelistClient: test.client}

			got := app.GetMyAnimeListDetail(41467)
			if got.Outcome != test.wantOutcome {
				t.Fatalf("outcome: got %q want %q (result %#v)", got.Outcome, test.wantOutcome, got)
			}
			if got.Outcome == contracts.AnimePatchOutcomeConflict {
				t.Fatalf("conflict outcome must never be produced, got %#v", got)
			}
			if test.wantMessageHas != "" && !strings.Contains(got.Message, test.wantMessageHas) {
				t.Fatalf("message %q does not name the anchor %q", got.Message, test.wantMessageHas)
			}
		})
	}
}

// TestGetMyAnimeListDetailMapsDetailFields proves the full field mapping,
// separate from the outcome-mapping table above, using whole-struct equality
// so a dropped or mis-copied field fails the comparison instead of a
// per-field if-chain silently skipping it.
func TestGetMyAnimeListDetailMapsDetailFields(t *testing.T) {
	client := &fakeMyAnimeListClient{detail: myanimelist.Detail{
		Title: "Bleach: Sennen Kessen-hen", Type: "TV", Episodes: "13", Duration: "24",
		Source: "Manga", Studios: []string{"Pierrot"}, Genres: []string{"Action", "Adventure"},
		Unfilled: []string{"Source:"},
	}}
	app := &App{ctx: context.Background(), myanimelistClient: client}

	got := app.GetMyAnimeListDetail(41467)
	want := contracts.MyAnimeListDetailResult{
		Outcome: contracts.AnimePatchOutcomeApplied, Message: got.Message,
		Title: "Bleach: Sennen Kessen-hen", Type: "TV", Episodes: "13", Duration: "24",
		Source: "Manga", Studios: []string{"Pierrot"}, Genres: []string{"Action", "Adventure"},
		Unfilled: []string{"Source:"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("detail mapping: got %#v want %#v", got, want)
	}
	if client.lastMalID != 41467 {
		t.Fatalf("expected malID to reach the client, got %d", client.lastMalID)
	}
}
