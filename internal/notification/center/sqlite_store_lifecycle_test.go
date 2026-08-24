package center

import (
	"context"
	"database/sql"
	"reflect"
	"testing"
	"time"
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

// seedLifecycleAction inserts one record carrying one action at the given
// createdAtMS and returns the action's frozen-at-creation Args, so a test
// can compare a later LoadAction read against them byte-for-byte.
func seedLifecycleAction(t *testing.T, store *Store, actionID string, createdAtMS int64) map[string]string {
	t.Helper()
	args := map[string]string{"animeId": "42", "trigger": "notification_action"}
	if _, err := store.InsertRecord(context.Background(), Record{
		CreatedAtMS: createdAtMS, Title: "t", Body: "b", Level: "info", Source: "seed",
		Actions: []Action{{ID: actionID, Ordinal: 0, Label: "Run this anime again", Intent: IntentDownloadRunAnime, Args: args}},
	}); err != nil {
		t.Fatalf("seed lifecycle action: %v", err)
	}
	return args
}

// TestStampExecutedTwiceKeepsTheFirstTimestamp asserts the store-level
// guard directly: a second StampExecuted call on an already-stamped action
// does NOT overwrite the first execution's timestamp. This is defense in
// depth (the Executor's own already_executed check already prevents ever
// reaching a second StampExecuted call in production), so it is exercised
// here at the store level rather than only implied by executor_test.go.
func TestStampExecutedTwiceKeepsTheFirstTimestamp(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()
	seedLifecycleAction(t, store, "act-1", 1000)

	if err := store.StampExecuted(ctx, "act-1", 5000); err != nil {
		t.Fatalf("first stamp executed: %v", err)
	}
	if err := store.StampExecuted(ctx, "act-1", 9000); err != nil {
		t.Fatalf("second stamp executed: %v", err)
	}

	action, found, err := store.LoadAction(ctx, "act-1")
	if err != nil || !found {
		t.Fatalf("load action: found=%v err=%v", found, err)
	}
	if action.ExecutedAtMS != 5000 {
		t.Fatalf("expected the second StampExecuted call to leave the first timestamp (5000) untouched, got %d", action.ExecutedAtMS)
	}
}

// TestStampRefusedPersistsReasonAcrossRestart asserts a refusal reason
// survives a process restart: StampRefused, then a NEW Store over the same
// DB (simulated restart), LoadAction returns the same RefusedReason -- this
// is what makes "permanently disabled" true even across a reload (design
// Decision D).
func TestStampRefusedPersistsReasonAcrossRestart(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()
	seedLifecycleAction(t, store, "act-1", 1000)

	if err := store.StampRefused(ctx, "act-1", RefusalTargetMissing); err != nil {
		t.Fatalf("stamp refused: %v", err)
	}

	restarted := NewStore(db, StoreConfig{})
	action, found, err := restarted.LoadAction(ctx, "act-1")
	if err != nil {
		t.Fatalf("load action after restart: %v", err)
	}
	if !found {
		t.Fatal("expected the action to still be found after restart")
	}
	if action.RefusedReason != RefusalTargetMissing {
		t.Fatalf("expected the refusal reason to survive a restart, got %q", action.RefusedReason)
	}
}

// TestArgsJSONNeverUpdatedByAnyStatement round-trips: an action's Args after
// StampExecuted is byte-identical to the Args at creation time
// (notification-actions spec, "An action's args cannot be altered after
// creation").
func TestArgsJSONNeverUpdatedByAnyStatement(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()
	originalArgs := seedLifecycleAction(t, store, "act-1", 1000)

	if err := store.StampExecuted(ctx, "act-1", 5000); err != nil {
		t.Fatalf("stamp executed: %v", err)
	}

	action, found, err := store.LoadAction(ctx, "act-1")
	if err != nil {
		t.Fatalf("load action: %v", err)
	}
	if !found {
		t.Fatal("expected the action to be found")
	}
	if !reflect.DeepEqual(action.Args, originalArgs) {
		t.Fatalf("expected Args to be byte-identical to their creation-time value after StampExecuted, got %#v (want %#v)", action.Args, originalArgs)
	}
}

// TestActionValidatedIdenticallyRegardlessOfElapsedTime asserts an action
// created with an artificially old CreatedAtMS on its owning record still
// loads and stamps identically to a freshly-created one -- no elapsed-time
// check exists anywhere in this path (notification-actions spec, "An action
// pressed long after creation, with its record still present, resolves
// normally").
func TestActionValidatedIdenticallyRegardlessOfElapsedTime(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	ctx := context.Background()
	const ancientCreatedAtMS = 1 // far in the past relative to any real clock
	seedLifecycleAction(t, store, "act-1", ancientCreatedAtMS)

	if err := store.StampExecuted(ctx, "act-1", time.Now().UnixMilli()); err != nil {
		t.Fatalf("stamp executed on an ancient action: %v", err)
	}

	action, found, err := store.LoadAction(ctx, "act-1")
	if err != nil {
		t.Fatalf("load action: %v", err)
	}
	if !found {
		t.Fatal("expected an ancient action to still be found and stampable")
	}
	if action.ExecutedAtMS == 0 {
		t.Fatal("expected the ancient action to stamp executedAtMs exactly as a fresh one would -- no elapsed-time check refused it")
	}
}
