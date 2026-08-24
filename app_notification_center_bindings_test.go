package main

import (
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
	if row.ActionCount != 0 {
		// Store.List() deliberately does not load per-row actions
		// (sqlite_store_list.go, Slice 2a) -- ActionCount for LIST rows is
		// 0 until the list SQL grows a per-record action count, a follow-up
		// beyond this slice's scope. GetNotification's detail read (below)
		// DOES report the real count, because Store.Record loads full
		// actions.
		t.Fatalf("expected ActionCount 0 for a list row given List() does not load actions, got %d", row.ActionCount)
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

	if result := app.ArchiveNotifications([]int64{1}); !result.Degraded {
		t.Fatal("expected ArchiveNotifications to degrade when the store is nil")
	}

	if result := app.RestoreNotifications([]int64{1}); !result.Degraded {
		t.Fatal("expected RestoreNotifications to degrade when the store is nil")
	}
}
