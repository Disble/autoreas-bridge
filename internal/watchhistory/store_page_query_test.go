package watchhistory

import (
	"context"
	"slices"
	"strings"
	"testing"
)

// TestPageAcrossEqualTimestampBoundaryVisitsEveryRowOnce asserts both orders
// page every row exactly once when a page boundary falls inside a run of
// equal watched_at_ms values, using the id tiebreaker mirrored for each
// direction (design.md D1).
func TestPageAcrossEqualTimestampBoundaryVisitsEveryRowOnce(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		order Order
		want  [][]int64 // ids per page, in visit order
	}{
		{name: "newest first splits the equal-timestamp run across two pages", order: OrderNewestFirst, want: [][]int64{{4, 3}, {2, 1}}},
		{name: "oldest first splits the equal-timestamp run across two pages", order: OrderOldestFirst, want: [][]int64{{1, 2}, {3, 4}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertPagesVisitEveryRowOnce(t, tc.order, tc.want)
		})
	}
}

// assertPagesVisitEveryRowOnce seeds four rows sharing one watched_at_ms,
// pages through them in order, and asserts the visited pages equal want
// exactly. Extracted so the nested paging loop stays out of a t.Run body
// (gocognit fails functions above 15).
func assertPagesVisitEveryRowOnce(t *testing.T, order Order, want [][]int64) {
	t.Helper()
	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()
	for i := int64(1); i <= 4; i++ {
		insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", i, i, 5000))
	}

	var got [][]int64
	cursor := ""
	for {
		page, err := store.Page(ctx, PageQuery{Limit: 2, Cursor: cursor, Order: order})
		if err != nil {
			t.Fatalf("page after cursor %q: %v", cursor, err)
		}
		got = append(got, itemIDs(page))
		cursor = page.NextCursor
		if cursor == "" {
			break
		}
	}
	if len(got) != len(want) {
		t.Fatalf("pages = %v, want %v", got, want)
	}
	for i := range want {
		if !slices.Equal(got[i], want[i]) {
			t.Fatalf("page %d = %v, want %v", i, got[i], want[i])
		}
	}
}

// TestPageSearchMatchesAsciiCaseFoldedLikeEscapedSubstring asserts Search
// matches an ASCII case-folded, LIKE-escaped substring of anime_name in both
// orders: ASCII letters fold, non-ASCII letters do not, and '%'/'_' match
// literally rather than as wildcards (design.md D1's search rules).
func TestPageSearchMatchesAsciiCaseFoldedLikeEscapedSubstring(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()
	cafe := historyRow("anime-cafe", 1, 1, 1000)
	cafe.AnimeName = "Café Terrace"
	percent := historyRow("anime-percent", 2, 1, 2000)
	percent.AnimeName = "100% Pascal"
	underscore := historyRow("anime-underscore", 3, 1, 3000)
	underscore.AnimeName = "a_b Show"
	underscoreDecoy := historyRow("anime-underscore-decoy", 4, 1, 4000)
	underscoreDecoy.AnimeName = "aXb Show"
	for _, e := range []Entry{cafe, percent, underscore, underscoreDecoy} {
		insertWatchHistoryRow(t, ctx, store, e)
	}

	cases := []struct {
		name   string
		order  Order
		search string
		want   []int64
	}{
		{name: "ascii letters fold, newest first", order: OrderNewestFirst, search: "café", want: []int64{1}},
		{name: "ascii letters fold, oldest first", order: OrderOldestFirst, search: "café", want: []int64{1}},
		{name: "non-ascii CAFÉ does not fold and does not match", order: OrderNewestFirst, search: "CAFÉ", want: nil},
		{name: "percent matches its literal text, not as a wildcard", order: OrderNewestFirst, search: "100%", want: []int64{2}},
		{name: "underscore matches its literal text, excluding a different character", order: OrderNewestFirst, search: "a_b", want: []int64{3}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Not t.Parallel(): these rows share one in-memory *sql.DB, and
			// database/sql opens a second, separately-empty ":memory:"
			// connection under concurrent load, which would flake this table.
			page, err := store.Page(ctx, PageQuery{Limit: 10, Order: tc.order, Search: tc.search})
			if err != nil {
				t.Fatalf("page: %v", err)
			}
			if got := itemIDs(page); !slices.Equal(got, tc.want) {
				t.Fatalf("item IDs = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestPageWatchedRangeIsHalfOpen asserts FromMS is inclusive and ToMS is
// exclusive at their exact boundaries, in both orders (design.md D1/D4).
func TestPageWatchedRangeIsHalfOpen(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		order        Order
		fromMS, toMS int64
		want         []int64
	}{
		{name: "newest first", order: OrderNewestFirst, fromMS: 1000, toMS: 2000, want: []int64{2, 3}},
		{name: "oldest first", order: OrderOldestFirst, fromMS: 1000, toMS: 2000, want: []int64{2, 3}},
		{name: "a one-millisecond upper bound keeps only epoch-zero rows", toMS: 1, want: []int64{6}},
		{name: "a one-millisecond lower bound drops only epoch-zero rows", fromMS: 1, want: []int64{1, 2, 3, 4, 5}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openStoreTestDB(t)
			store := NewStore(db)
			ctx := context.Background()
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 1, 1, 999))  // before the range
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 2, 2, 1000)) // exactly at FromMS: included
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 3, 3, 1999)) // inside the range
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 4, 4, 2000)) // exactly at ToMS: excluded
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 5, 5, 2001)) // after the range
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 6, 6, 0))    // at epoch zero

			page, err := store.Page(ctx, PageQuery{Limit: 10, Order: tc.order, FromMS: tc.fromMS, ToMS: tc.toMS})
			if err != nil {
				t.Fatalf("page: %v", err)
			}
			got := itemIDs(page)
			slices.Sort(got)
			if !slices.Equal(got, tc.want) {
				t.Fatalf("item IDs = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestPageAnimeIDsFiltersOrLeavesUnfiltered asserts an empty AnimeIDs set
// means unfiltered and a non-empty set narrows to those anime IDs only, in
// both orders (design.md D2).
func TestPageAnimeIDsFiltersOrLeavesUnfiltered(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		order    Order
		animeIDs []string
		want     []int64
	}{
		{name: "empty set is unfiltered, newest first", order: OrderNewestFirst, animeIDs: nil, want: []int64{1, 2, 3}},
		{name: "empty set is unfiltered, oldest first", order: OrderOldestFirst, animeIDs: nil, want: []int64{1, 2, 3}},
		{name: "a non-empty set narrows to those anime IDs, newest first", order: OrderNewestFirst, animeIDs: []string{"anime-1"}, want: []int64{1}},
		{name: "a non-empty set narrows to those anime IDs, oldest first", order: OrderOldestFirst, animeIDs: []string{"anime-1"}, want: []int64{1}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openStoreTestDB(t)
			store := NewStore(db)
			ctx := context.Background()
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-1", 1, 1, 1000))
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-2", 2, 1, 2000))
			insertWatchHistoryRow(t, ctx, store, historyRow("anime-3", 3, 1, 3000))

			page, err := store.Page(ctx, PageQuery{Limit: 10, Order: tc.order, AnimeIDs: tc.animeIDs})
			if err != nil {
				t.Fatalf("page: %v", err)
			}
			got := itemIDs(page)
			slices.Sort(got)
			if !slices.Equal(got, tc.want) {
				t.Fatalf("item IDs = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestAnimePageCycleFiltersOrLeavesUnfiltered asserts Cycle 0 means every
// cycle and Cycle > 0 narrows the per-anime read to that one watch, in both
// orders (design.md D1; spec.md "A cycle scope returns only that watch's
// rows").
func TestAnimePageCycleFiltersOrLeavesUnfiltered(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		order Order
		cycle int64
		want  []int64
	}{
		{name: "zero is every cycle, newest first", order: OrderNewestFirst, cycle: 0, want: []int64{1, 2}},
		{name: "zero is every cycle, oldest first", order: OrderOldestFirst, cycle: 0, want: []int64{1, 2}},
		{name: "a positive cycle narrows to that watch, newest first", order: OrderNewestFirst, cycle: 2, want: []int64{2}},
		{name: "a positive cycle narrows to that watch, oldest first", order: OrderOldestFirst, cycle: 2, want: []int64{2}},
		{name: "the first watch narrows to cycle one", order: OrderNewestFirst, cycle: 1, want: []int64{1}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openStoreTestDB(t)
			store := NewStore(db)
			ctx := context.Background()
			cycleOne := historyRow("anime-1", 1, 1, 1000)
			cycleOne.Cycle = 1
			cycleTwo := historyRow("anime-1", 2, 1, 2000)
			cycleTwo.Cycle = 2
			insertWatchHistoryRow(t, ctx, store, cycleOne)
			insertWatchHistoryRow(t, ctx, store, cycleTwo)

			page, err := store.AnimePage(ctx, "anime-1", PageQuery{Limit: 10, Order: tc.order, Cycle: tc.cycle})
			if err != nil {
				t.Fatalf("anime page: %v", err)
			}
			got := itemIDs(page)
			slices.Sort(got)
			if !slices.Equal(got, tc.want) {
				t.Fatalf("item IDs = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestPageCombinesSearchRangeAndAnimeIDs asserts Search, the watched range
// and the anime-ID set apply together as one AND-ed predicate, in both
// orders (design.md D1's builder).
func TestPageCombinesSearchRangeAndAnimeIDs(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		order Order
	}{
		{name: "newest first", order: OrderNewestFirst},
		{name: "oldest first", order: OrderOldestFirst},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openStoreTestDB(t)
			store := NewStore(db)
			ctx := context.Background()
			match := historyRow("anime-1", 1, 1, 1500)
			match.AnimeName = "Café Terrace"
			wrongName := historyRow("anime-1", 2, 2, 1500)
			wrongName.AnimeName = "Something Else"
			outOfRange := historyRow("anime-1", 3, 3, 5000)
			outOfRange.AnimeName = "Café Terrace"
			wrongAnime := historyRow("anime-2", 4, 1, 1500)
			wrongAnime.AnimeName = "Café Terrace"
			for _, e := range []Entry{match, wrongName, outOfRange, wrongAnime} {
				insertWatchHistoryRow(t, ctx, store, e)
			}

			page, err := store.Page(ctx, PageQuery{
				Limit: 10, Order: tc.order,
				Search: "café", FromMS: 1000, ToMS: 2000, AnimeIDs: []string{"anime-1"},
			})
			if err != nil {
				t.Fatalf("page: %v", err)
			}
			if got, want := itemIDs(page), []int64{1}; !slices.Equal(got, want) {
				t.Fatalf("item IDs = %v, want %v", got, want)
			}
		})
	}
}

// TestPageQueryUnknownOrderReturnsBuilderError asserts an unrecognized Order
// value fails the builder rather than silently defaulting to newest-first
// (design.md D1).
func TestPageQueryUnknownOrderReturnsBuilderError(t *testing.T) {
	t.Parallel()

	if _, _, err := buildPageQuery("", PageQuery{Order: Order(99)}, 50); err == nil {
		t.Fatal("expected an error for an unknown page order")
	}
}

// TestPageQueryPlanAvoidsTempBTreeInBothOrders asserts an unfiltered global
// page never needs a temporary B-tree for ORDER BY, in either order --
// idx_watch_history_watched_at already provides that order (design.md D1).
func TestPageQueryPlanAvoidsTempBTreeInBothOrders(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		order Order
	}{
		{name: "newest first", order: OrderNewestFirst},
		{name: "oldest first", order: OrderOldestFirst},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openStoreTestDB(t)
			plan := explainPageQueryPlan(t, db, "", PageQuery{Order: tc.order, Cursor: encodePageCursor(pageCursor{WatchedAtMS: 5000, ID: 3})}, 50)
			if strings.Contains(plan, "USE TEMP B-TREE FOR ORDER BY") {
				t.Fatalf("expected no temp B-tree for ORDER BY, got plan %q", plan)
			}
		})
	}
}

// TestAnimePageCycleScopedQueryPlanSeeksAnAnimeLeadingIndex asserts a
// cycle-scoped AnimePage never scans the whole table, seeking one of the two
// anime-leading indexes instead (design.md D1's plan test).
func TestAnimePageCycleScopedQueryPlanSeeksAnAnimeLeadingIndex(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	plan := explainPageQueryPlan(t, db, "anime-1", PageQuery{Cycle: 2}, 50)
	if strings.Contains(plan, "SCAN watch_history") {
		t.Fatalf("expected the cycle-scoped page to seek an index, not scan watch_history, got plan %q", plan)
	}
	if !strings.Contains(plan, "idx_watch_history_anime") && !strings.Contains(plan, "idx_watch_history_episode") {
		t.Fatalf("expected the cycle-scoped page to seek an anime-leading index, got plan %q", plan)
	}
}
