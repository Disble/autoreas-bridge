package center

import (
	"context"
	"database/sql"
	"testing"
)

// seedNotificationRecord inserts one notification_records row with the given
// title, body, source, and level, returning its id. Unlike
// seedNotificationRecords/seedNotificationRecordsWithTimestamps (both of
// which write identical "seed"/"seed body"/"info"/"seed" rows), the filter
// tests below need rows that actually differ on the fields being filtered.
func seedNotificationRecord(t *testing.T, db *sql.DB, createdAtMS int64, title, body, source, level string) int64 {
	t.Helper()
	res, err := db.Exec(
		`INSERT INTO notification_records (created_at_ms, title, body, level, source) VALUES (?, ?, ?, ?, ?)`,
		createdAtMS, title, body, level, source,
	)
	if err != nil {
		t.Fatalf("seed filtered record %q: %v", title, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("get last insert id for %q: %v", title, err)
	}
	return id
}

// listAll drains every page of query via its keyset cursor, returning every
// visited record in the order List returns it. Used by the filtered-paging
// test below, where a single page is not enough to prove nothing repeats or
// is skipped once a filter narrows the result set.
func listAll(t *testing.T, store *Store, query ListQuery) []Record {
	t.Helper()
	var all []Record
	cursor := ""
	for {
		query.Cursor = cursor
		page, err := store.List(context.Background(), query)
		if err != nil {
			t.Fatalf("list page: %v", err)
		}
		all = append(all, page.Items...)
		if page.NextCursor == "" {
			return all
		}
		cursor = page.NextCursor
	}
}

// TestListSearchMatchesTitleOrBodyCaseInsensitive asserts Search matches a
// substring in either Title or Body, case-insensitively, and excludes rows
// that match neither. Satisfies the team-lead-specified matching semantics
// for the filter bar's search box.
func TestListSearchMatchesTitleOrBodyCaseInsensitive(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	titleMatch := seedNotificationRecord(t, db, 3000, "Download FINISHED", "body one", "download", "success")
	bodyMatch := seedNotificationRecord(t, db, 2000, "unrelated title", "One Piece EPISODE ready", "download", "success")
	seedNotificationRecord(t, db, 1000, "nothing relevant", "nothing relevant either", "download", "success")

	page, err := store.List(context.Background(), ListQuery{Search: "episode", Limit: 10})
	if err != nil {
		t.Fatalf("list with search: %v", err)
	}
	// bodyMatch matched "EPISODE" case-insensitively in Body; titleMatch did
	// NOT contain "episode" in either field, so seed it as a negative check
	// on the OTHER search below instead of asserting it here.
	if len(page.Items) != 1 || page.Items[0].ID != bodyMatch {
		t.Fatalf("expected only the body match for %q, got %#v", "episode", page.Items)
	}

	page, err = store.List(context.Background(), ListQuery{Search: "finished", Limit: 10})
	if err != nil {
		t.Fatalf("list with search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != titleMatch {
		t.Fatalf("expected only the title match for %q, got %#v", "finished", page.Items)
	}
}

// TestListSearchEscapesLikeMetacharacters asserts a literal '%' or '_' typed
// in the search box matches only the literal text, never acting as a LIKE
// wildcard. A mutant that drops the ESCAPE clause (or the replacer) makes
// this test fail, because the wildcard reading would ALSO match the
// deliberately-planted negative row below.
func TestListSearchEscapesLikeMetacharacters(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		search        string
		literalTitle  string
		wildcardTitle string
	}{
		{name: "percent", search: "100%", literalTitle: "100% discount", wildcardTitle: "100X discount"},
		{name: "underscore", search: "user_1", literalTitle: "user_1 signed in", wildcardTitle: "userX1 signed in"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			db := openBootstrappedTestDB(t)
			store := NewStore(db, StoreConfig{})
			literalID := seedNotificationRecord(t, db, 2000, tc.literalTitle, "body", "download", "info")
			seedNotificationRecord(t, db, 1000, tc.wildcardTitle, "body", "download", "info")

			page, err := store.List(context.Background(), ListQuery{Search: tc.search, Limit: 10})
			if err != nil {
				t.Fatalf("list with search %q: %v", tc.search, err)
			}
			if len(page.Items) != 1 || page.Items[0].ID != literalID {
				t.Fatalf("expected search %q to match only the literal row, got %#v", tc.search, page.Items)
			}
		})
	}
}

// TestListSourcesFiltersToExactSet asserts Sources restricts the result to
// exactly the requested set, excluding every other source.
func TestListSourcesFiltersToExactSet(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	download := seedNotificationRecord(t, db, 3000, "a", "body", "download", "info")
	season := seedNotificationRecord(t, db, 2000, "b", "body", "season", "info")
	seedNotificationRecord(t, db, 1000, "c", "body", "network", "info")

	page, err := store.List(context.Background(), ListQuery{Sources: []string{"download", "season"}, Limit: 10})
	if err != nil {
		t.Fatalf("list with sources filter: %v", err)
	}
	gotIDs := map[int64]bool{}
	for _, item := range page.Items {
		gotIDs[item.ID] = true
	}
	if len(page.Items) != 2 || !gotIDs[download] || !gotIDs[season] {
		t.Fatalf("expected exactly the download and season rows, got %#v", page.Items)
	}
}

// TestListLevelsFiltersToExactSet asserts Levels restricts the result to
// exactly the requested set, excluding every other level.
func TestListLevelsFiltersToExactSet(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	success := seedNotificationRecord(t, db, 3000, "a", "body", "download", "success")
	seedNotificationRecord(t, db, 2000, "b", "body", "download", "warning")
	seedNotificationRecord(t, db, 1000, "c", "body", "download", "info")

	page, err := store.List(context.Background(), ListQuery{Levels: []Level{"success"}, Limit: 10})
	if err != nil {
		t.Fatalf("list with levels filter: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != success {
		t.Fatalf("expected exactly the success-level row, got %#v", page.Items)
	}
}

// TestListSearchAndSourcesCombineWithAnd asserts Search and Sources conjoin
// (AND), never either alone: only a row matching BOTH filters is returned.
func TestListSearchAndSourcesCombineWithAnd(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	both := seedNotificationRecord(t, db, 3000, "Alpha", "body", "download", "info")
	seedNotificationRecord(t, db, 2000, "Beta", "body", "download", "info") // right source, wrong title
	seedNotificationRecord(t, db, 1000, "Alpha", "body", "network", "info") // right title, wrong source

	page, err := store.List(context.Background(), ListQuery{Search: "Alpha", Sources: []string{"download"}, Limit: 10})
	if err != nil {
		t.Fatalf("list with search+sources: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != both {
		t.Fatalf("expected search and sources to combine with AND, got %#v", page.Items)
	}
}

// TestListFilteredKeysetPageNeverRepeatsOrSkips is the filtered equivalent of
// TestListKeysetPageNeverRepeatsOrSkips: a Sources filter narrows the result
// set, and paging across multiple pages must still visit every matching row
// exactly once, in strict newest-first order -- proving the filter's
// placement ahead of the cursor predicate does not break keyset paging.
func TestListFilteredKeysetPageNeverRepeatsOrSkips(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})

	// Mixed timestamps (including a same-millisecond run) across TWO
	// sources, matching TestListKeysetPageNeverRepeatsOrSkips' own seeding
	// rationale: a single shared timestamp would leave the keyset
	// predicate's primary comparison unable to affect the result at all.
	var wantIDs []int64
	wantIDs = append(wantIDs, seedNotificationRecord(t, db, 400, "a", "b", "download", "info"))
	seedNotificationRecord(t, db, 400, "x", "y", "season", "info") // excluded by the filter
	wantIDs = append(wantIDs, seedNotificationRecord(t, db, 300, "a", "b", "download", "info"))
	wantIDs = append(wantIDs, seedNotificationRecord(t, db, 300, "a", "b", "download", "info"))
	seedNotificationRecord(t, db, 300, "x", "y", "season", "info") // excluded by the filter
	wantIDs = append(wantIDs, seedNotificationRecord(t, db, 200, "a", "b", "download", "info"))
	wantIDs = append(wantIDs, seedNotificationRecord(t, db, 100, "a", "b", "download", "info"))

	walked := listAll(t, store, ListQuery{Sources: []string{"download"}, Limit: 3})

	if len(walked) != len(wantIDs) {
		t.Fatalf("expected to visit exactly the %d download-sourced rows, visited %d: %#v", len(wantIDs), len(walked), walked)
	}
	seen := map[int64]bool{}
	for i, record := range walked {
		if seen[record.ID] {
			t.Fatalf("expected no duplicate visits across pages, saw id %d twice", record.ID)
		}
		seen[record.ID] = true
		if record.Source != "download" {
			t.Fatalf("expected every visited row to be download-sourced, got %#v", record)
		}
		if i > 0 && !recordIsStrictlyOlder(record, walked[i-1]) {
			t.Fatalf("expected strict newest-first order, got previous=%+v then=%+v", walked[i-1], record)
		}
	}
}

// TestListEmptyFiltersMatchEverything drives one seeded store: nil Levels, nil
// Sources and an empty or whitespace Search are each a no-op returning every
// row, and a limit equal to the rows that remain yields no next cursor.
func TestListEmptyFiltersMatchEverything(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedNotificationRecord(t, db, 3000, "one", "body", "download", "success")
	seedNotificationRecord(t, db, 2000, "two", "body", "season", "warning")
	seedNotificationRecord(t, db, 1000, "three", "body", "download", "info")

	for name, query := range map[string]ListQuery{
		"nil levels":        {Levels: nil, Limit: 10},
		"nil sources":       {Sources: nil, Limit: 10},
		"empty search":      {Search: "", Limit: 10},
		"whitespace search": {Search: "   ", Limit: 10},
	} {
		page, err := store.List(context.Background(), query)
		if err != nil {
			t.Fatalf("list with %s: %v", name, err)
		}
		if len(page.Items) != 3 {
			t.Fatalf("expected %s to match all 3 seeded rows, got %d", name, len(page.Items))
		}
	}

	page, err := store.List(context.Background(), ListQuery{Limit: 3})
	if err != nil {
		t.Fatalf("list page: %v", err)
	}
	if len(page.Items) != 3 {
		t.Fatalf("expected exactly 3 items, got %d", len(page.Items))
	}
	if page.NextCursor != "" {
		t.Fatalf("expected no next cursor when exactly Limit records remain, got %q", page.NextCursor)
	}
}
