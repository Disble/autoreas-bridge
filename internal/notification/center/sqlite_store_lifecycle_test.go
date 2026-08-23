package center

import (
	"context"
	"database/sql"
	"testing"
)

// notificationRecordIDAt returns the id of the single seeded row at
// created_at_ms, so lifecycle tests can target a specific record without
// depending on AUTOINCREMENT's exact numbering.
func notificationRecordIDAt(t *testing.T, db *sql.DB, createdAtMS int64) int64 {
	t.Helper()
	var id int64
	if err := db.QueryRow(`SELECT id FROM notification_records WHERE created_at_ms = ?`, createdAtMS).Scan(&id); err != nil {
		t.Fatalf("find record id at created_at_ms=%d: %v", createdAtMS, err)
	}
	return id
}

// containsRecordID reports whether items includes a record with the given id.
func containsRecordID(items []Record, id int64) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

// TestMarkReadDecrementsUnreadCountExactlyOnce asserts marking a record read
// drops the unread count by exactly 1, and marking the SAME record read a
// second time does not decrement it again. Satisfies notification-center
// spec "Marking a record read decrements the unread count exactly once."
func TestMarkReadDecrementsUnreadCountExactlyOnce(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 3, 1000) // every seeded row is unread by construction
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()

	before, err := store.UnreadCount(ctx)
	if err != nil {
		t.Fatalf("unread count before: %v", err)
	}
	if before != 3 {
		t.Fatalf("expected 3 unread records seeded, got %d", before)
	}

	targetID := notificationRecordIDAt(t, db, 1000)

	affected, err := store.MarkRead(ctx, []int64{targetID}, 5000)
	if err != nil {
		t.Fatalf("mark read: %v", err)
	}
	if affected != 1 {
		t.Fatalf("expected exactly 1 row affected, got %d", affected)
	}
	afterFirst, err := store.UnreadCount(ctx)
	if err != nil {
		t.Fatalf("unread count after first mark: %v", err)
	}
	if afterFirst != before-1 {
		t.Fatalf("expected unread count to drop by exactly 1, got %d (before %d)", afterFirst, before)
	}

	// Marking the SAME record read a second time must not decrement again.
	affectedAgain, err := store.MarkRead(ctx, []int64{targetID}, 6000)
	if err != nil {
		t.Fatalf("mark read again: %v", err)
	}
	if affectedAgain != 0 {
		t.Fatalf("expected 0 rows affected on the second mark-read, got %d", affectedAgain)
	}
	afterSecond, err := store.UnreadCount(ctx)
	if err != nil {
		t.Fatalf("unread count after second mark: %v", err)
	}
	if afterSecond != afterFirst {
		t.Fatalf("expected unread count unchanged by the second mark-read; before %d, after %d", afterFirst, afterSecond)
	}
}

// TestArchiveRemovesFromDefaultActiveListAndMarksReadIfUnread asserts
// archiving an unread record removes it from the default active list view,
// keeps it queryable through the archived view, and marks it read in the
// same operation. Satisfies notification-center spec "Archiving a record
// removes it from the default active list."
func TestArchiveRemovesFromDefaultActiveListAndMarksReadIfUnread(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 1, 1000)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()
	targetID := notificationRecordIDAt(t, db, 1000)

	affected, err := store.Archive(ctx, []int64{targetID}, 5000)
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	if affected != 1 {
		t.Fatalf("expected exactly 1 row archived, got %d", affected)
	}

	activePage, err := store.List(ctx, ListQuery{View: ViewActive, Limit: 10})
	if err != nil {
		t.Fatalf("list active view: %v", err)
	}
	if containsRecordID(activePage.Items, targetID) {
		t.Fatal("expected the archived record to be absent from the default active view")
	}

	archivedPage, err := store.List(ctx, ListQuery{View: ViewArchived, Limit: 10})
	if err != nil {
		t.Fatalf("list archived view: %v", err)
	}
	if !containsRecordID(archivedPage.Items, targetID) {
		t.Fatal("expected the archived record to remain queryable through the archived view")
	}

	record, found, err := store.Record(ctx, targetID)
	if err != nil {
		t.Fatalf("load record: %v", err)
	}
	if !found {
		t.Fatal("expected the archived record to still be found by id")
	}
	if record.ReadAtMS == 0 {
		t.Fatal("expected archiving an unread record to also mark it read in the same operation")
	}
	if record.ArchivedAtMS == 0 {
		t.Fatal("expected archived_at_ms to be stamped")
	}
}

// TestRestoreClearsArchivedButNotRead asserts Restore clears archived_at_ms
// and deliberately leaves read_at_ms untouched: a restored record does not
// become unread again (design §5.6 -- "you already saw it").
func TestRestoreClearsArchivedButNotRead(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 1, 1000)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()
	targetID := notificationRecordIDAt(t, db, 1000)

	if _, err := store.Archive(ctx, []int64{targetID}, 5000); err != nil {
		t.Fatalf("archive: %v", err)
	}

	affected, err := store.Restore(ctx, []int64{targetID})
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if affected != 1 {
		t.Fatalf("expected exactly 1 row restored, got %d", affected)
	}

	record, found, err := store.Record(ctx, targetID)
	if err != nil {
		t.Fatalf("load record: %v", err)
	}
	if !found {
		t.Fatal("expected the restored record to still be found")
	}
	if record.ArchivedAtMS != 0 {
		t.Fatalf("expected archived_at_ms cleared after restore, got %d", record.ArchivedAtMS)
	}
	if record.ReadAtMS == 0 {
		t.Fatal("expected read_at_ms to remain stamped after restore -- restoring must NOT mark the record unread again")
	}

	activePage, err := store.List(ctx, ListQuery{View: ViewActive, Limit: 10})
	if err != nil {
		t.Fatalf("list active view: %v", err)
	}
	if !containsRecordID(activePage.Items, targetID) {
		t.Fatal("expected the restored record to be visible again in the default active view")
	}
}

// TestTotalEverRecordedCountsAllRowsRegardlessOfView is an ADDED test, not
// named by the task text: design §10's NotificationPage.TotalEver ("drives
// empty state 1 vs 2" -- distinguishing "nothing has ever been recorded"
// from "records exist but none match the current filter") has no store
// method anywhere in design §5.6's signature list, yet the DTO task 2.2.6
// builds cannot be populated without one. Added as the minimal, unambiguous
// closure (unlike Search/Sources/Levels' undefined matching semantics):
// TotalEverRecorded is a bare, filter-independent COUNT(*), so archived and
// read rows both count.
func TestTotalEverRecordedCountsAllRowsRegardlessOfView(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()

	zero, err := store.TotalEverRecorded(ctx)
	if err != nil {
		t.Fatalf("total ever recorded (empty): %v", err)
	}
	if zero != 0 {
		t.Fatalf("expected 0 with no records seeded, got %d", zero)
	}

	seedNotificationRecords(t, db, 3, 1000)
	targetID := notificationRecordIDAt(t, db, 1000)
	if _, err := store.Archive(ctx, []int64{targetID}, 5000); err != nil {
		t.Fatalf("archive one record: %v", err)
	}

	total, err := store.TotalEverRecorded(ctx)
	if err != nil {
		t.Fatalf("total ever recorded: %v", err)
	}
	if total != 3 {
		t.Fatalf("expected TotalEverRecorded to count all 3 rows regardless of archived/active split, got %d", total)
	}
}
