package desktop

import (
	"reflect"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/watchhistory"
)

// TestToWatchHistoryPageQuery pins the pure mapping from the wire
// WatchHistoryPageRequest to watchhistory.PageQuery (design.md D3): every
// field copies through, an empty Order defaults to newest-first, "oldest"
// selects the mirrored comparator, and any other value is a builder error
// rather than a silent default.
func TestToWatchHistoryPageQuery(t *testing.T) {
	tests := []struct {
		name    string
		request contracts.WatchHistoryPageRequest
		want    watchhistory.PageQuery
		wantErr bool
	}{
		{
			name:    "an empty order defaults to newest-first",
			request: contracts.WatchHistoryPageRequest{Order: ""},
			want:    watchhistory.PageQuery{Order: watchhistory.OrderNewestFirst},
		},
		{
			name:    "oldest selects the oldest-first order",
			request: contracts.WatchHistoryPageRequest{Order: "oldest"},
			want:    watchhistory.PageQuery{Order: watchhistory.OrderOldestFirst},
		},
		{
			name:    "an unrecognized order is a builder error",
			request: contracts.WatchHistoryPageRequest{Order: "sideways"},
			wantErr: true,
		},
		{
			name: "every field copies through",
			request: contracts.WatchHistoryPageRequest{
				Search: "frieren", AnimeIDs: []string{"anime-1", "anime-2"},
				WatchedFromMS: 1700000000000, WatchedToMS: 1700003600000,
				Order: "oldest", Cursor: "1700000000000:1", Limit: 50,
			},
			want: watchhistory.PageQuery{
				Search: "frieren", AnimeIDs: []string{"anime-1", "anime-2"},
				FromMS: 1700000000000, ToMS: 1700003600000,
				Order: watchhistory.OrderOldestFirst, Cursor: "1700000000000:1", Limit: 50,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := toWatchHistoryPageQuery(tc.request)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got none")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("expected %#v, got %#v", tc.want, got)
			}
		})
	}
}

// TestToAnimeWatchHistoryPageQuery pins the pure mapping from the wire
// AnimeWatchHistoryPageRequest to watchhistory.PageQuery: every field copies
// through. The per-anime request carries no Search, AnimeIDs, watched range,
// or Order, so the mapped query never sets them (design.md D3).
func TestToAnimeWatchHistoryPageQuery(t *testing.T) {
	request := contracts.AnimeWatchHistoryPageRequest{AnimeID: "anime-1", Cycle: 2, Cursor: "1700000000000:1", Limit: 3}
	want := watchhistory.PageQuery{Cycle: 2, Cursor: "1700000000000:1", Limit: 3}

	if got := toAnimeWatchHistoryPageQuery(request); !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %#v, got %#v", want, got)
	}
}
