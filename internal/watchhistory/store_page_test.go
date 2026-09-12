package watchhistory

import (
	"context"
	"testing"
)

// TestEncodeDecodePageCursorRoundTrips asserts the opaque "<watched_at_ms>:<id>"
// cursor round-trips exactly, matching eventlog.EventSearchPage's NextCursor
// convention (design.md D5).
func TestEncodeDecodePageCursorRoundTrips(t *testing.T) {
	t.Parallel()

	want := pageCursor{WatchedAtMS: 1700000000123, ID: 42}
	encoded := encodePageCursor(want)
	got, err := decodePageCursor(encoded)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got != want {
		t.Fatalf("decode(encode(%v)) = %v", want, got)
	}
}

// TestDecodePageCursorRejectsGarbage asserts a malformed cursor value fails
// to decode rather than silently producing a wrong page.
func TestDecodePageCursorRejectsGarbage(t *testing.T) {
	t.Parallel()

	if _, err := decodePageCursor("not-a-cursor"); err == nil {
		t.Fatal("expected an error decoding a malformed cursor")
	}
}

// TestClampPageLimitAppliesDefaultAndCeiling asserts limit clamping matches
// eventlog's clampEventSearchLimit shape: non-positive falls back to the
// default, oversized clamps to the ceiling, and an in-range value passes
// through unchanged. Expected values are literals, never the
// defaultPageLimit/maxPageLimit constants being pinned (CLAUDE.md #16):
// asserting against the same symbol under test would pass unchanged even if
// its value were mutated.
func TestClampPageLimitAppliesDefaultAndCeiling(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		limit int
		want  int
	}{
		{name: "zero uses the default", limit: 0, want: 50},
		{name: "negative uses the default", limit: -5, want: 50},
		{name: "one is in-range and passes through unchanged", limit: 1, want: 1},
		{name: "the ceiling itself passes through unclamped", limit: 200, want: 200},
		{name: "oversized clamps to the ceiling", limit: 99999, want: 200},
		{name: "in-range passes through", limit: 10, want: 10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := clampPageLimit(tc.limit); got != tc.want {
				t.Fatalf("clampPageLimit(%d) = %d, want %d", tc.limit, got, tc.want)
			}
		})
	}
}

// insertWatchHistoryRow inserts one row directly, bypassing Derive, so page
// tests can seed exact fixtures including equal-timestamp collisions.
func insertWatchHistoryRow(t *testing.T, ctx context.Context, store *Store, e Entry) {
	t.Helper()
	_, err := store.db.ExecContext(ctx, `
		INSERT INTO watch_history (id, anime_id, anime_name, episode, cycle, watched_at_ms, source)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.AnimeID, e.AnimeName, e.Episode, e.Cycle, e.WatchedAtMS, e.Source)
	if err != nil {
		t.Fatalf("seed watch_history row %+v: %v", e, err)
	}
}

// TestPagePagesNewestFirstWithoutGapOrDuplicate asserts Page resumes
// exactly after the cursor, newest first, across the whole global table.
func TestPagePagesNewestFirstWithoutGapOrDuplicate(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	for i := int64(1); i <= 5; i++ {
		insertWatchHistoryRow(t, ctx, store, Entry{ID: i, AnimeID: "anime-1", AnimeName: "Anime One", Episode: i, Cycle: 1, WatchedAtMS: i * 1000, Source: "desktop"})
	}

	first, err := store.Page(ctx, PageQuery{Limit: 2})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	if len(first.Items) != 2 || first.Items[0].Episode != 5 || first.Items[1].Episode != 4 {
		t.Fatalf("expected newest-first [5 4], got %#v", first.Items)
	}
	if first.NextCursor == "" {
		t.Fatal("expected a next cursor when more rows remain")
	}

	second, err := store.Page(ctx, PageQuery{Limit: 2, Cursor: first.NextCursor})
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if len(second.Items) != 2 || second.Items[0].Episode != 3 || second.Items[1].Episode != 2 {
		t.Fatalf("expected [3 2] resuming after the cursor, got %#v", second.Items)
	}

	third, err := store.Page(ctx, PageQuery{Limit: 2, Cursor: second.NextCursor})
	if err != nil {
		t.Fatalf("page 3: %v", err)
	}
	if len(third.Items) != 1 || third.Items[0].Episode != 1 {
		t.Fatalf("expected the last row [1] with no further cursor, got %#v (cursor=%q)", third.Items, third.NextCursor)
	}
	if third.NextCursor != "" {
		t.Fatalf("expected no next cursor on the last page, got %q", third.NextCursor)
	}
}

// TestPageEqualTimestampTiebreaksById asserts rows sharing one
// watched_at_ms still page deterministically via the id DESC tiebreaker
// (design.md D5: seven events inside three seconds is ordinary, not
// hypothetical).
func TestPageEqualTimestampTiebreaksById(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	for i := int64(1); i <= 3; i++ {
		insertWatchHistoryRow(t, ctx, store, Entry{ID: i, AnimeID: "anime-1", AnimeName: "Anime One", Episode: i, Cycle: 1, WatchedAtMS: 5000, Source: "desktop"})
	}

	page, err := store.Page(ctx, PageQuery{Limit: 10})
	if err != nil {
		t.Fatalf("page: %v", err)
	}
	if len(page.Items) != 3 || page.Items[0].ID != 3 || page.Items[1].ID != 2 || page.Items[2].ID != 1 {
		t.Fatalf("expected id-descending tiebreak [3 2 1], got %#v", page.Items)
	}
}

// TestPageSetsNoCursorWhenExactlyOnePageOfRowsExists asserts that when the
// total row count exactly equals the requested limit (no probe row beyond
// it), NextCursor stays empty rather than pointing at a page that would
// come back empty.
func TestPageSetsNoCursorWhenExactlyOnePageOfRowsExists(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	insertWatchHistoryRow(t, ctx, store, Entry{ID: 1, AnimeID: "anime-1", AnimeName: "Anime One", Episode: 1, Cycle: 1, WatchedAtMS: 1000, Source: "desktop"})
	insertWatchHistoryRow(t, ctx, store, Entry{ID: 2, AnimeID: "anime-1", AnimeName: "Anime One", Episode: 2, Cycle: 1, WatchedAtMS: 2000, Source: "desktop"})

	page, err := store.Page(ctx, PageQuery{Limit: 2})
	if err != nil {
		t.Fatalf("page: %v", err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("expected both rows on the single page, got %#v", page.Items)
	}
	if page.NextCursor != "" {
		t.Fatalf("expected no next cursor when exactly one page of rows exists, got %q", page.NextCursor)
	}
}

// TestAnimePageSeeksTheAnimeIndexOnly asserts AnimePage returns only the
// requested anime's rows, never another anime's.
func TestAnimePageSeeksTheAnimeIndexOnly(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	insertWatchHistoryRow(t, ctx, store, Entry{ID: 1, AnimeID: "anime-1", AnimeName: "Anime One", Episode: 1, Cycle: 1, WatchedAtMS: 1000, Source: "desktop"})
	insertWatchHistoryRow(t, ctx, store, Entry{ID: 2, AnimeID: "anime-2", AnimeName: "Anime Two", Episode: 1, Cycle: 1, WatchedAtMS: 2000, Source: "desktop"})
	insertWatchHistoryRow(t, ctx, store, Entry{ID: 3, AnimeID: "anime-1", AnimeName: "Anime One", Episode: 2, Cycle: 1, WatchedAtMS: 3000, Source: "desktop"})

	page, err := store.AnimePage(ctx, "anime-1", PageQuery{Limit: 10})
	if err != nil {
		t.Fatalf("anime page: %v", err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("expected exactly 2 rows for anime-1, got %#v", page.Items)
	}
	for _, item := range page.Items {
		if item.AnimeID != "anime-1" {
			t.Fatalf("expected only anime-1 rows, got %#v", item)
		}
	}
}
