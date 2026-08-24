package main

import (
	"context"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification/center"
	bridgeSync "autoreas-bridge/internal/sync"
)

// notificationCenterAppTestDB opens a real bootstrapped bridge schema in a
// temp file, mirroring captureAppTestDB / app_notification_center_wrap_test.go's
// convention, so the notification-center store's SQL runs against the exact
// schema production wires.
func notificationCenterAppTestDB(t *testing.T) *App {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return &App{bridgeDB: db, notificationCenterStore: center.NewStore(db, center.StoreConfig{})}
}

// findWireNotificationRow returns the row with the given id from a wire page,
// so a lifecycle assertion can name the row it cares about instead of
// carrying its own search loop.
func findWireNotificationRow(page contracts.NotificationPage, id int64) (contracts.NotificationRow, bool) {
	for _, row := range page.Items {
		if row.ID == id {
			return row, true
		}
	}
	return contracts.NotificationRow{}, false
}

// TestListNotificationsMapsStoreValuesToContractDTOs asserts ListNotifications
// maps a persisted center.Record into the wire NotificationRow/NotificationPage
// shape.
func TestListNotificationsMapsStoreValuesToContractDTOs(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000,
		Title:       "Download finished",
		Body:        "One Piece episode 1090 is ready",
		Level:       "success",
		Source:      "download",
		Actions: []center.Action{
			{ID: "act-1", Ordinal: 0, Label: "Open folder", Intent: "download.open_folder", Args: map[string]string{"path": "/tmp"}},
		},
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	page := app.ListNotifications(contracts.NotificationListRequest{Limit: 10})

	if page.Degraded {
		t.Fatal("expected a populated page not to be degraded")
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected 1 item, got %d (%#v)", len(page.Items), page.Items)
	}
	row := page.Items[0]
	if row.ID != id || row.Title != "Download finished" || row.Body != "One Piece episode 1090 is ready" ||
		row.Level != "success" || row.Source != "download" || row.CreatedAtMs != 1000 {
		t.Fatalf("unexpected mapped row: %#v", row)
	}
	if row.ActionCount != 1 {
		// This used to assert 0, describing a list query that loaded no
		// action count at all. Store.List() still deliberately loads no
		// action BODIES, but the select column list now carries a
		// correlated COUNT, so a list row reports the real number -- which
		// is what the master list needs to show that a record is actionable
		// without opening it.
		t.Fatalf("expected ActionCount 1 for a list row carrying one action, got %d", row.ActionCount)
	}
	if page.TotalEver != 1 {
		t.Fatalf("expected TotalEver to count the 1 seeded record, got %d", page.TotalEver)
	}
	if page.AppliedLimit != 10 {
		t.Fatalf("expected AppliedLimit to echo the requested limit, got %d", page.AppliedLimit)
	}
}

// TestListNotificationsAppliesSearchAndSourceFilters asserts toListQuery
// really forwards Search/Sources/Levels through to the store (Slice 3b):
// only the record matching BOTH the search text and the requested source is
// returned, proving the wiring end to end rather than only at the store's
// own unit tests.
func TestListNotificationsAppliesSearchAndSourceFilters(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)
	ctx := app.notificationCenterCtx()

	matchID, err := app.notificationCenterStore.InsertRecord(ctx, center.Record{CreatedAtMS: 3000, Title: "Download finished", Body: "b", Level: "success", Source: "download"})
	if err != nil {
		t.Fatalf("insert matching record: %v", err)
	}
	if _, err := app.notificationCenterStore.InsertRecord(ctx, center.Record{CreatedAtMS: 2000, Title: "Download finished", Body: "b", Level: "success", Source: "season"}); err != nil {
		t.Fatalf("insert wrong-source record: %v", err)
	}
	if _, err := app.notificationCenterStore.InsertRecord(ctx, center.Record{CreatedAtMS: 1000, Title: "Season sync", Body: "b", Level: "success", Source: "download"}); err != nil {
		t.Fatalf("insert wrong-title record: %v", err)
	}

	page := app.ListNotifications(contracts.NotificationListRequest{Search: "Download", Sources: []string{"download"}, Limit: 10})

	if page.Degraded {
		t.Fatal("expected a populated filtered page not to be degraded")
	}
	if len(page.Items) != 1 || page.Items[0].ID != matchID {
		t.Fatalf("expected exactly the record matching both the search text and the source filter, got %#v", page.Items)
	}
}

// TestGetNotificationFoundMapsRowsAndActions asserts GetNotification maps a
// persisted record's detail rows and actions into the wire DTO shape,
// including the real ActionCount (Store.Record loads full actions, unlike
// List).
func TestGetNotificationFoundMapsRowsAndActions(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000,
		Title:       "Season sync finished",
		Body:        "2 anime finished, 1 failed",
		Level:       "warning",
		Source:      "download",
		Rows: []center.DetailRow{
			{Ref: center.EntityRef{Type: "anime", ID: "anime-1"}, Name: "One Piece", Status: "finished", Detail: "ep 1090", ActionIDs: []string{"act-1"}},
		},
		Actions: []center.Action{
			{ID: "act-1", RowRef: "anime-1", Ordinal: 0, Label: "Open folder", Intent: "download.open_folder", Args: map[string]string{"path": "/tmp"}},
		},
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	result := app.GetNotification(id)

	if !result.Found {
		t.Fatalf("expected the just-inserted record to be found, got %#v", result)
	}
	if result.Degraded {
		t.Fatal("expected a found result not to be degraded")
	}
	if result.Item.ActionCount != 1 {
		t.Fatalf("expected ActionCount 1 (Store.Record loads full actions), got %d", result.Item.ActionCount)
	}
	if len(result.Item.Rows) != 1 || result.Item.Rows[0].RefType != "anime" || result.Item.Rows[0].RefID != "anime-1" {
		t.Fatalf("expected 1 mapped detail row with ref anime/anime-1, got %#v", result.Item.Rows)
	}
	if len(result.Item.Actions) != 1 || result.Item.Actions[0].ID != "act-1" || result.Item.Actions[0].Label != "Open folder" {
		t.Fatalf("expected 1 mapped action act-1, got %#v", result.Item.Actions)
	}
}

// TestGetNotificationNotFoundReturnsFoundFalseNotDegraded asserts a missing
// id reports Found=false without a Degraded flag -- distinguishing "no such
// id" from a broken store.
func TestGetNotificationNotFoundReturnsFoundFalseNotDegraded(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	result := app.GetNotification(999999)

	if result.Found {
		t.Fatal("expected a missing id not to be found")
	}
	if result.Degraded {
		t.Fatal("expected a not-found (but reachable) result not to be degraded")
	}
}

// TestMarkNotificationsReadUpdatesUnreadCountExactlyOnce asserts the binding
// wraps Store.MarkRead/UnreadCount correctly end to end: marking a record
// read once decrements UnreadCount, and marking the SAME record read again
// does not decrement it a second time.
func TestMarkNotificationsReadUpdatesUnreadCountExactlyOnce(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}
	if got := app.GetUnreadNotificationCount(); got != 1 {
		t.Fatalf("expected 1 unread record seeded, got %d", got)
	}

	result := app.MarkNotificationsRead([]int64{id})
	if result.Degraded {
		t.Fatal("expected a successful mark-read not to be degraded")
	}
	if result.Affected != 1 || result.UnreadCount != 0 {
		t.Fatalf("expected Affected=1 UnreadCount=0 after marking the only record read, got %#v", result)
	}

	again := app.MarkNotificationsRead([]int64{id})
	if again.Affected != 0 || again.UnreadCount != 0 {
		t.Fatalf("expected marking an already-read record read again to be a no-op, got %#v", again)
	}
}

// TestArchiveNotificationsRemovesFromDefaultListAndMarksRead asserts the
// binding wraps Store.Archive end to end: an archived record disappears from
// the default active-view list and is marked read in the same operation.
func TestArchiveNotificationsRemovesFromDefaultListAndMarksRead(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	result := app.ArchiveNotifications([]int64{id})
	if result.Degraded || result.Affected != 1 {
		t.Fatalf("expected a successful archive of 1 record, got %#v", result)
	}

	activePage := app.ListNotifications(contracts.NotificationListRequest{View: "active", Limit: 10})
	for _, row := range activePage.Items {
		if row.ID == id {
			t.Fatal("expected the archived record to be absent from the default active view")
		}
	}

	archivedPage := app.ListNotifications(contracts.NotificationListRequest{View: "archived", Limit: 10})
	found := false
	for _, row := range archivedPage.Items {
		if row.ID == id {
			found = true
			if row.ReadAtMs == 0 {
				t.Fatal("expected the archived record to also be marked read")
			}
		}
	}
	if !found {
		t.Fatal("expected the archived record to remain queryable through the archived view")
	}
}

// TestArchiveNotificationsEmitsArchivedEvent asserts a successful archive
// emits notificationArchivedEventName carrying the archived ids, through the
// existing a.emitFn test-double seam (see app_lifecycle_test.go /
// app_capture_realtime_test.go for precedent) -- design.md §3 Decision G, so
// a live toast for one of those ids can be closed client-side without the
// toast module importing the notification-center feature directly.
func TestArchiveNotificationsEmitsArchivedEvent(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	var gotEventName string
	var gotData []interface{}
	app.emitFn = func(_ context.Context, eventName string, optionalData ...interface{}) {
		gotEventName = eventName
		gotData = optionalData
	}

	result := app.ArchiveNotifications([]int64{id})
	if result.Degraded || result.Affected != 1 {
		t.Fatalf("expected a successful archive of 1 record, got %#v", result)
	}

	if gotEventName != notificationArchivedEventName {
		t.Fatalf("expected the %q event to be emitted, got %q", notificationArchivedEventName, gotEventName)
	}
	if len(gotData) != 1 {
		t.Fatalf("expected exactly one data argument (the archived ids), got %#v", gotData)
	}
	ids, ok := gotData[0].([]int64)
	if !ok || len(ids) != 1 || ids[0] != id {
		t.Fatalf("expected the archived ids to be emitted, got %#v", gotData[0])
	}
}

// TestArchiveNotificationsNilEmitFnNeverPanics asserts a nil a.emitFn (the
// zero value most tests construct) degrades the event emission to a silent
// no-op rather than panicking.
func TestArchiveNotificationsNilEmitFnNeverPanics(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	result := app.ArchiveNotifications([]int64{id})
	if result.Degraded || result.Affected != 1 {
		t.Fatalf("expected a successful archive of 1 record even with a nil emitFn, got %#v", result)
	}
}

// TestRestoreNotificationsClearsArchivedButKeepsRead asserts the binding
// wraps Store.Restore end to end: a restored record reappears in the active
// view but stays read.
func TestRestoreNotificationsClearsArchivedButKeepsRead(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}
	if archived := app.ArchiveNotifications([]int64{id}); archived.Degraded {
		t.Fatalf("expected archive to succeed: %#v", archived)
	}

	result := app.RestoreNotifications([]int64{id})
	if result.Degraded || result.Affected != 1 {
		t.Fatalf("expected a successful restore of 1 record, got %#v", result)
	}

	activePage := app.ListNotifications(contracts.NotificationListRequest{View: "active", Limit: 10})
	found := false
	for _, row := range activePage.Items {
		if row.ID == id {
			found = true
			if row.ReadAtMs == 0 {
				t.Fatal("expected the restored record to remain read -- restore must NOT mark it unread again")
			}
		}
	}
	if !found {
		t.Fatal("expected the restored record to be visible again in the default active view")
	}
}

// TestBindingsReturnDegradedTrueWhenStoreNilNeverPanic constructs an *App
// with notificationCenterStore == nil and asserts every binding degrades
// gracefully (Degraded: true, or the equivalent zero/empty result) instead
// of panicking.
func TestBindingsReturnDegradedTrueWhenStoreNilNeverPanic(t *testing.T) {
	t.Parallel()
	app := &App{}

	page := app.ListNotifications(contracts.NotificationListRequest{})
	if !page.Degraded {
		t.Fatal("expected ListNotifications to degrade when the store is nil")
	}
	if page.Items == nil {
		t.Fatal("expected a nil-safe (non-nil) empty Items slice")
	}

	if result := app.GetNotification(1); !result.Degraded {
		t.Fatal("expected GetNotification to degrade when the store is nil")
	}

	if got := app.GetUnreadNotificationCount(); got != 0 {
		t.Fatalf("expected GetUnreadNotificationCount to return 0 when the store is nil, got %d", got)
	}

	if result := app.MarkNotificationsRead([]int64{1}); !result.Degraded {
		t.Fatal("expected MarkNotificationsRead to degrade when the store is nil")
	}

	if result := app.MarkNotificationsUnread([]int64{1}); !result.Degraded {
		t.Fatal("expected MarkNotificationsUnread to degrade when the store is nil")
	}

	if result := app.ArchiveNotifications([]int64{1}); !result.Degraded {
		t.Fatal("expected ArchiveNotifications to degrade when the store is nil")
	}

	if result := app.RestoreNotifications([]int64{1}); !result.Degraded {
		t.Fatal("expected RestoreNotifications to degrade when the store is nil")
	}
}

// TestMarkNotificationsUnreadRaisesUnreadCountExactlyOnce asserts the binding
// wraps Store.MarkUnread/UnreadCount end to end: a read record marked unread
// raises the envelope's UnreadCount -- the value the rail badge consumes --
// and marking it unread a second time is a no-op.
func TestMarkNotificationsUnreadRaisesUnreadCountExactlyOnce(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}
	if read := app.MarkNotificationsRead([]int64{id}); read.Degraded || read.UnreadCount != 0 {
		t.Fatalf("expected the seeded record to be read with 0 unread left, got %#v", read)
	}

	result := app.MarkNotificationsUnread([]int64{id})
	if result.Degraded {
		t.Fatal("expected a successful mark-unread not to be degraded")
	}
	if result.Affected != 1 || result.UnreadCount != 1 {
		t.Fatalf("expected Affected=1 UnreadCount=1 after putting the only record back to unread, got %#v", result)
	}

	again := app.MarkNotificationsUnread([]int64{id})
	if again.Affected != 0 || again.UnreadCount != 1 {
		t.Fatalf("expected marking an already-unread record unread again to be a no-op, got %#v", again)
	}
}

// TestMarkNotificationsUnreadKeepsAnArchivedRecordArchived asserts the
// binding carries the store's axis separation through to the wire: a record
// archived (and therefore read) that is then marked unread stays out of the
// active view and keeps its archived stamp, while its ReadAtMs clears. Read
// and archive compose; neither reverses the other (design-canvas
// Lifecycle.dc.html).
func TestMarkNotificationsUnreadKeepsAnArchivedRecordArchived(t *testing.T) {
	t.Parallel()
	app := notificationCenterAppTestDB(t)

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed"})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}
	if archived := app.ArchiveNotifications([]int64{id}); archived.Degraded {
		t.Fatalf("expected archive to succeed: %#v", archived)
	}

	result := app.MarkNotificationsUnread([]int64{id})
	if result.Degraded || result.Affected != 1 {
		t.Fatalf("expected a successful mark-unread of 1 archived record, got %#v", result)
	}
	if result.UnreadCount != 1 {
		t.Fatalf("expected an archived-but-unread record to count toward the rail badge, got UnreadCount=%d", result.UnreadCount)
	}

	activePage := app.ListNotifications(contracts.NotificationListRequest{View: "active", Limit: 10})
	if _, onActiveList := findWireNotificationRow(activePage, id); onActiveList {
		t.Fatal("expected mark unread NOT to pull the record back onto the active view -- that is Restore's job")
	}

	archivedPage := app.ListNotifications(contracts.NotificationListRequest{View: "archived", Limit: 10})
	row, found := findWireNotificationRow(archivedPage, id)
	if !found {
		t.Fatal("expected the archived record to remain queryable through the archived view")
	}
	if row.ReadAtMs != 0 {
		t.Fatalf("expected read_at_ms cleared on the wire row after mark unread, got %d", row.ReadAtMs)
	}
	if row.ArchivedAtMs == 0 {
		t.Fatal("expected the record to keep its archived stamp after being marked unread")
	}
}
