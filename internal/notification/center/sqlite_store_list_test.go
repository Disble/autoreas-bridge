package center

import (
	"context"
	"database/sql"
	"testing"
)

// seedNotificationRecordsWithTimestamps inserts one bare notification_records
// row per entry of timestampsMS, in order, so a test can construct an exact
// (created_at_ms, id) shape -- including several rows sharing one
// millisecond, split across a page boundary -- rather than a strictly
// monotonic sequence that would only ever exercise the keyset predicate's
// primary comparison and never its tiebreak. Ids increase monotonically with
// insertion order (AUTOINCREMENT).
func seedNotificationRecordsWithTimestamps(t *testing.T, db *sql.DB, timestampsMS []int64) {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin timestamped seed tx: %v", err)
	}
	stmt, err := tx.Prepare(`INSERT INTO notification_records (created_at_ms, title, body, level, source) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		t.Fatalf("prepare timestamped seed stmt: %v", err)
	}
	defer func() { _ = stmt.Close() }()
	for i, createdAtMS := range timestampsMS {
		if _, err := stmt.Exec(createdAtMS, "seed", "seed body", "info", "seed"); err != nil {
			t.Fatalf("seed timestamped record %d: %v", i, err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit timestamped seed tx: %v", err)
	}
}

// recordIsStrictlyOlder reports whether a is strictly older than b under the
// newest-first (created_at_ms DESC, id DESC) ordering the store's index and
// keyset predicate both rely on.
func recordIsStrictlyOlder(a, b Record) bool {
	if a.CreatedAtMS != b.CreatedAtMS {
		return a.CreatedAtMS < b.CreatedAtMS
	}
	return a.ID < b.ID
}

// TestListFirstPageReturnsCursorForNextPage asserts the first page returns a
// cursor for the next page whenever more records exist than fit in one page.
// Satisfies notification-center spec "The first page returns a cursor for
// the next page."
func TestListFirstPageReturnsCursorForNextPage(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 5, 1000)
	store := NewStore(db, StoreConfig{})

	page, err := store.List(context.Background(), ListQuery{Limit: 2})
	if err != nil {
		t.Fatalf("list first page: %v", err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("expected 2 items on the first page, got %d", len(page.Items))
	}
	if page.NextCursor == "" {
		t.Fatal("expected a non-empty NextCursor when more records exist than fit in one page")
	}
}

// TestListKeysetPageNeverRepeatsOrSkips asserts a cursor-based next page
// never repeats or skips a row relative to the newest-first (created_at_ms,
// id) ordering. The seeded timestamps are DELIBERATELY a mix, not a single
// shared value: [100, 100, 200, 300, 300, 300, 400] puts a 3-row run sharing
// one millisecond (300) exactly on the Limit=3 page boundary, so walking all
// pages exercises BOTH halves of the keyset predicate --
// "(created_at_ms < ? OR (created_at_ms = ? AND id < ?))" -- the primary
// comparison (crossing 400 -> 300 -> 200 -> 100) AND the tiebreak (splitting
// the three id-300 rows across the page boundary). A single shared timestamp
// across every row would leave the primary comparison's direction unable to
// affect the result at all, silently hiding a flipped `<`. Satisfies
// notification-center spec "A cursor-based next page never repeats or skips
// a row relative to `When` ordering."
// appendPageInOrder folds one page onto the rows walked so far, failing the
// test if an id repeats across pages or a row breaks newest-first order. It
// lives outside the walk loop so the paging test stays under the cognitive
// complexity ceiling without giving up either assertion -- both are what kill
// a flipped keyset comparison.
func appendPageInOrder(t *testing.T, walked []Record, seen map[int64]bool, items []Record) []Record {
	t.Helper()

	for _, item := range items {
		if seen[item.ID] {
			t.Fatalf("expected no duplicate visits across pages, saw id %d twice", item.ID)
		}
		seen[item.ID] = true
		if len(walked) > 0 {
			previous := walked[len(walked)-1]
			if !recordIsStrictlyOlder(item, previous) {
				t.Fatalf("expected every subsequent row to be strictly older than the previous one; "+
					"got previous=%+v then=%+v out of newest-first order", previous, item)
			}
		}
		walked = append(walked, item)
	}

	return walked
}

func TestListKeysetPageNeverRepeatsOrSkips(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecordsWithTimestamps(t, db, []int64{100, 100, 200, 300, 300, 300, 400})
	store := NewStore(db, StoreConfig{})

	var walked []Record
	seen := map[int64]bool{}
	cursor := ""
	for {
		page, err := store.List(context.Background(), ListQuery{Limit: 3, Cursor: cursor})
		if err != nil {
			t.Fatalf("list page: %v", err)
		}
		walked = appendPageInOrder(t, walked, seen, page.Items)
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}

	if len(walked) != 7 {
		t.Fatalf("expected to visit all 7 seeded rows across every page, visited %d", len(walked))
	}
}

// TestListExactlyLimitRemainingRecordsHasNoNextCursor asserts a page that
// exhausts every remaining record -- exactly Limit rows, no more, no fewer --
// reports an empty NextCursor. This is the page-size/hasMore boundary: the
// probe technique requests limit+1 rows specifically to distinguish "exactly
// Limit rows exist" (no further page) from "more than Limit rows exist" (a
// further page); a query returning precisely Limit rows must NOT be mistaken
// for the latter, or a client would loop forever believing more data exists.
func TestListExactlyLimitRemainingRecordsHasNoNextCursor(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 3, 1000)
	store := NewStore(db, StoreConfig{})

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

// TestRecordReturnsStoredRecordWithActions asserts Record loads a persisted
// notification's full field set, including its actions in ordinal order.
func TestRecordReturnsStoredRecordWithActions(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})

	inserted := Record{
		CreatedAtMS: 2000,
		Title:       "Download finished",
		Body:        "One Piece episode 1090 is ready",
		Level:       "success",
		Source:      "download",
		Actions: []Action{
			{ID: "act-1", RowRef: "row-1", Ordinal: 0, Label: "Open folder", Intent: "download.open_folder", Args: map[string]string{"path": "/tmp"}},
			{ID: "act-2", RowRef: "row-1", Ordinal: 1, Label: "Run again", Intent: "download.run_anime", Args: map[string]string{"animeId": "42"}},
		},
	}
	id, err := store.InsertRecord(context.Background(), inserted)
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	got, found, err := store.Record(context.Background(), id)
	if err != nil {
		t.Fatalf("load record: %v", err)
	}
	if !found {
		t.Fatal("expected the just-inserted record to be found")
	}
	if got.Title != inserted.Title || got.Body != inserted.Body || got.Level != inserted.Level || got.Source != inserted.Source {
		t.Fatalf("unexpected loaded record fields: %#v", got)
	}
	if len(got.Actions) != 2 {
		t.Fatalf("expected 2 loaded actions, got %d", len(got.Actions))
	}
	if got.Actions[0].ID != "act-1" || got.Actions[1].ID != "act-2" {
		t.Fatalf("expected actions in ordinal order [act-1 act-2], got [%s %s]", got.Actions[0].ID, got.Actions[1].ID)
	}
	if got.Actions[0].Args["path"] != "/tmp" {
		t.Fatalf("expected action args to round-trip, got %#v", got.Actions[0].Args)
	}
}

// TestRecordReturnsNotFoundForUnknownID asserts Record reports found == false
// for an id that does not exist, without returning an error.
func TestRecordReturnsNotFoundForUnknownID(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})

	_, found, err := store.Record(context.Background(), 999999)
	if err != nil {
		t.Fatalf("expected no error for an unknown id, got %v", err)
	}
	if found {
		t.Fatal("expected found == false for an unknown id")
	}
}
