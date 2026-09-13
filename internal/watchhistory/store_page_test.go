package watchhistory

import (
	"context"
	"slices"
	"strings"
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

// TestClampPageLimitAppliesDefaultAndCeiling asserts default/ceiling clamping (literals, not the pinned constants -- CLAUDE.md #16).
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

// historyRow builds a desktop-source watch_history row, varying only id,
// episode, and watched-at timestamp. AnimeName is never asserted.
func historyRow(animeID string, id, episode, watchedAtMS int64) Entry {
	return Entry{ID: id, AnimeID: animeID, AnimeName: "Anime Name", Episode: episode, Cycle: 1, WatchedAtMS: watchedAtMS, Source: "desktop"}
}

// itemIDs extracts a page's item IDs in order, for slices.Equal comparisons.
func itemIDs(page Page) []int64 {
	ids := make([]int64, len(page.Items))
	for i, item := range page.Items {
		ids[i] = item.ID
	}
	return ids
}

// TestPageEqualTimestampTiebreaksById asserts rows sharing one watched_at_ms
// still page deterministically via the id DESC tiebreaker (design.md D5).
func TestPageEqualTimestampTiebreaksById(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	for i := int64(1); i <= 3; i++ {
		insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", i, i, 5000))
	}

	page, err := store.Page(ctx, PageQuery{Limit: 10})
	if err != nil {
		t.Fatalf("page: %v", err)
	}
	if got, want := itemIDs(page), []int64{3, 2, 1}; !slices.Equal(got, want) {
		t.Fatalf("item IDs = %v, want %v", got, want)
	}
}

// TestPageSetsNoCursorWhenExactlyOnePageOfRowsExists asserts NextCursor
// stays empty when the row count exactly equals the requested limit,
// rather than pointing at a page that would come back empty.
func TestPageSetsNoCursorWhenExactlyOnePageOfRowsExists(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 1, 1, 1000))
	insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 2, 2, 2000))

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

	insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 1, 1, 1000))
	insertWatchHistoryRow(t, ctx, store, historyRow("anime-2", 2, 1, 2000))
	insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 3, 2, 3000))

	page, err := store.AnimePage(ctx, "anime-1", PageQuery{Limit: 10})
	if err != nil {
		t.Fatalf("anime page: %v", err)
	}
	if got, want := itemIDs(page), []int64{3, 1}; !slices.Equal(got, want) {
		t.Fatalf("item IDs = %v, want %v", got, want)
	}
}

// TestAnimePageQueryPlanSeeksTheAnimeIndex asserts SQLite answers a per-anime
// page by searching idx_watch_history_anime, never by scanning the table.
func TestAnimePageQueryPlanSeeksTheAnimeIndex(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	query, args, err := buildPageQuery("anime-1", encodePageCursor(pageCursor{WatchedAtMS: 5000, ID: 3}), 50)
	if err != nil {
		t.Fatalf("build page query: %v", err)
	}
	rows, err := db.Query("EXPLAIN QUERY PLAN "+query, args...)
	if err != nil {
		t.Fatalf("explain page query: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var plan []string
	for rows.Next() {
		var id, parent, unused int
		var detail string
		if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
			t.Fatalf("scan query plan: %v", err)
		}
		plan = append(plan, detail)
	}
	if got := strings.Join(plan, "; "); !strings.Contains(got, "idx_watch_history_anime") || strings.Contains(got, "SCAN") {
		t.Fatalf("expected the per-anime page to seek idx_watch_history_anime, got plan %q", got)
	}
}

// TestAnimePageKeepsEachRowsRecordedName asserts a row shows the name it was
// recorded under after a rename; reads never join the anime table, so a
// deleted anime's rows stay readable too.
func TestAnimePageKeepsEachRowsRecordedName(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()
	for _, change := range []Change{
		{AnimeID: "anime-1", AnimeName: "Original Name", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 0, AfterEpisodes: 1, Cycle: 1},
		{AnimeID: "anime-1", AnimeName: "Renamed", Source: "desktop", OccurredAtMS: 2000, BeforeEpisodes: 1, AfterEpisodes: 2, Cycle: 1},
	} {
		if err := store.Apply(ctx, change); err != nil {
			t.Fatalf("apply %+v: %v", change, err)
		}
	}

	page, err := store.AnimePage(ctx, "anime-1", PageQuery{})
	if err != nil {
		t.Fatalf("anime page: %v", err)
	}
	if len(page.Items) != 2 || page.Items[0].AnimeName != "Renamed" || page.Items[1].AnimeName != "Original Name" {
		t.Fatalf("expected each row to keep its recorded name, got %#v", page.Items)
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
		insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", i, i, i*1000))
	}

	wantPages := [][]int64{{5, 4}, {3, 2}, {1}}
	cursor := ""
	for _, want := range wantPages {
		page, err := store.Page(ctx, PageQuery{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatalf("page after cursor %q: %v", cursor, err)
		}
		gotEpisodes := make([]int64, len(page.Items))
		for i, item := range page.Items {
			gotEpisodes[i] = item.Episode
		}
		if !slices.Equal(gotEpisodes, want) {
			t.Fatalf("episodes = %v, want %v", gotEpisodes, want)
		}
		cursor = page.NextCursor
	}
	if cursor != "" {
		t.Fatalf("expected no next cursor after the last page, got %q", cursor)
	}
}
