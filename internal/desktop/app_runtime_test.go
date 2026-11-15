package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

func TestGetAnimeDetailReturnsPopulatedDTOForExistingID(t *testing.T) {
	t.Parallel()

	want := &contracts.MobileAnime{ID: "anime-1", Name: "Frieren"}
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{mobileAnime: want}}

	got := app.GetAnimeDetail("anime-1")
	if got == nil {
		t.Fatal("expected populated detail DTO, got nil")
	}
	if got.ID != "anime-1" || got.Name != "Frieren" {
		t.Fatalf("unexpected detail DTO: %#v", got)
	}
}

func TestGetAnimeDetailReturnsNilForUnknownID(t *testing.T) {
	t.Parallel()

	app := &App{ctx: context.Background(), animeQuery: &stubAnimeQueryService{err: contracts.ErrAnimeNotFound}}

	if got := app.GetAnimeDetail("missing-id"); got != nil {
		t.Fatalf("expected nil for unknown id, got %#v", got)
	}
}

func TestGetAnimeDetailReturnsNilWhenAnimeQueryServiceNil(t *testing.T) {
	t.Parallel()

	app := &App{}

	if got := app.GetAnimeDetail("anime-1"); got != nil {
		t.Fatalf("expected nil when animeQuery is nil, got %#v", got)
	}
}

// TestGetWatchHistoryPageDegradesAndPassesThroughStorePage covers
// GetWatchHistoryPage's nil-guard (mirroring GetAnimes's contract),
// error-surfacing, and the successful passthrough of Store.Page's items and
// cursor.
func TestGetWatchHistoryPageDegradesAndPassesThroughStorePage(t *testing.T) {
	t.Parallel()

	successPage := watchhistory.Page{
		Items: []watchhistory.Entry{
			{ID: 1, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 12, Cycle: 1, WatchedAtMS: 1700000000000, Source: "desktop"},
		},
		NextCursor: "1700000000000:1",
	}

	tests := []struct {
		name    string
		request contracts.WatchHistoryPageRequest
		query   watchHistoryReader
		want    contracts.WatchHistoryPage
	}{
		{
			name:    "nil watch history query degrades to an error status",
			request: contracts.WatchHistoryPageRequest{Cursor: "some-cursor"},
			query:   nil,
			want:    contracts.WatchHistoryPage{Status: "error", Message: "watch history service unavailable"},
		},
		{
			name:    "an unrecognized order surfaces as an error status without reaching the store",
			request: contracts.WatchHistoryPageRequest{Cursor: "some-cursor", Order: "sideways"},
			query:   &stubWatchHistoryQuery{page: successPage},
			want:    contracts.WatchHistoryPage{Status: "error", Message: `unrecognized watch history order "sideways"`},
		},
		{
			name:    "a store error surfaces as an error status rather than an empty result",
			request: contracts.WatchHistoryPageRequest{Cursor: "some-cursor"},
			query:   &stubWatchHistoryQuery{err: errors.New("store unavailable")},
			want:    contracts.WatchHistoryPage{Status: "error", Message: "store unavailable"},
		},
		{
			name:    "a successful page passes its items and cursor through",
			request: contracts.WatchHistoryPageRequest{Cursor: "some-cursor"},
			query:   &stubWatchHistoryQuery{page: successPage},
			want: contracts.WatchHistoryPage{
				Items: []contracts.WatchHistoryEntry{
					{ID: 1, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 12, Cycle: 1, WatchedAtMS: 1700000000000, Source: "desktop"},
				},
				NextCursor: "1700000000000:1",
				Status:     "ok",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			app := &App{ctx: context.Background(), watchHistoryQuery: tc.query}
			if got := app.GetWatchHistoryPage(tc.request); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("expected %#v, got %#v", tc.want, got)
			}
		})
	}
}

// TestGetWatchHistoryPageForwardsRequestToStore asserts the request maps and
// reaches Store.Page as the PageQuery it expects -- the cursor unchanged and
// the wire Order resolved to its watchhistory.Order constant -- which the
// table above cannot assert because its rows share one call site.
func TestGetWatchHistoryPageForwardsRequestToStore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		order     string
		wantOrder watchhistory.Order
	}{
		{name: "an empty order forwards as newest-first", order: "", wantOrder: watchhistory.OrderNewestFirst},
		{name: "oldest forwards as oldest-first", order: "oldest", wantOrder: watchhistory.OrderOldestFirst},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			stub := &stubWatchHistoryQuery{}
			app := &App{ctx: context.Background(), watchHistoryQuery: stub}

			app.GetWatchHistoryPage(contracts.WatchHistoryPageRequest{Cursor: "1700000000000:5", Order: tc.order})

			if stub.lastQuery.Cursor != "1700000000000:5" {
				t.Fatalf("expected cursor %q forwarded to Store.Page, got %q", "1700000000000:5", stub.lastQuery.Cursor)
			}
			if stub.lastQuery.Order != tc.wantOrder {
				t.Fatalf("expected order %v forwarded to Store.Page, got %v", tc.wantOrder, stub.lastQuery.Order)
			}
		})
	}
}

// TestGetAnimeWatchHistoryPageDegradesAndPassesThroughAnimePage covers
// GetAnimeWatchHistoryPage's nil-guard, error-surfacing, and successful
// passthrough, mirroring TestGetWatchHistoryPageDegradesAndPassesThroughStorePage.
func TestGetAnimeWatchHistoryPageDegradesAndPassesThroughAnimePage(t *testing.T) {
	t.Parallel()

	successPage := watchhistory.Page{
		Items: []watchhistory.Entry{
			{ID: 2, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 13, Cycle: 1, WatchedAtMS: 1700000001000, Source: "mobile"},
		},
	}

	tests := []struct {
		name  string
		query watchHistoryReader
		want  contracts.WatchHistoryPage
	}{
		{
			name:  "nil watch history query degrades to an error status",
			query: nil,
			want:  contracts.WatchHistoryPage{Status: "error", Message: "watch history service unavailable"},
		},
		{
			name:  "a store error surfaces as an error status rather than an empty result",
			query: &stubWatchHistoryQuery{err: errors.New("store unavailable")},
			want:  contracts.WatchHistoryPage{Status: "error", Message: "store unavailable"},
		},
		{
			name:  "a successful page passes its items through",
			query: &stubWatchHistoryQuery{page: successPage},
			want: contracts.WatchHistoryPage{
				Items: []contracts.WatchHistoryEntry{
					{ID: 2, AnimeID: "anime-1", AnimeName: "Frieren", Episode: 13, Cycle: 1, WatchedAtMS: 1700000001000, Source: "mobile"},
				},
				Status: "ok",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			app := &App{ctx: context.Background(), watchHistoryQuery: tc.query}
			request := contracts.AnimeWatchHistoryPageRequest{AnimeID: "anime-1", Cursor: "some-cursor"}
			if got := app.GetAnimeWatchHistoryPage(request); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("expected %#v, got %#v", tc.want, got)
			}
		})
	}
}

// TestGetAnimeWatchHistoryPageForwardsRequestToStore asserts every request
// field -- the anime ID, the cursor, and the cycle scope -- reaches
// Store.AnimePage mapped into the PageQuery it expects.
func TestGetAnimeWatchHistoryPageForwardsRequestToStore(t *testing.T) {
	t.Parallel()

	stub := &stubWatchHistoryQuery{}
	app := &App{ctx: context.Background(), watchHistoryQuery: stub}

	app.GetAnimeWatchHistoryPage(contracts.AnimeWatchHistoryPageRequest{
		AnimeID: "anime-7", Cycle: 2, Cursor: "1700000000000:5", Limit: 3,
	})

	if stub.lastAnimeID != "anime-7" || stub.lastQuery.Cursor != "1700000000000:5" {
		t.Fatalf("expected animeID %q and cursor %q forwarded to Store.AnimePage, got animeID %q cursor %q",
			"anime-7", "1700000000000:5", stub.lastAnimeID, stub.lastQuery.Cursor)
	}
	if stub.lastQuery.Cycle != 2 || stub.lastQuery.Limit != 3 {
		t.Fatalf("expected cycle 2 and limit 3 forwarded to Store.AnimePage, got cycle %d limit %d",
			stub.lastQuery.Cycle, stub.lastQuery.Limit)
	}
}

func TestGetAnimeDetailViewDelegatesToAnimeQuery(t *testing.T) {
	t.Parallel()

	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"totalEpisodes":12,"active":true}`, 777)
	app := &App{ctx: context.Background(), animeQuery: anime.NewQueryService(store)}

	got := app.GetAnimeDetailView("anime-1")

	if got.ID != "anime-1" || got.Name != "Frieren" {
		t.Fatalf("expected anime detail from query service, got %#v", got)
	}
	if got.Progress.Total == nil || *got.Progress.Total != 12 {
		t.Fatalf("expected total 12, got %#v", got.Progress)
	}
	if got.Progress.Remaining == nil || *got.Progress.Remaining != 10 {
		t.Fatalf("expected remaining 10, got %#v", got.Progress)
	}
	if got.ModifiedAt != 777 {
		t.Fatalf("expected modified_at 777, got %d", got.ModifiedAt)
	}
}
