package desktop

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
)

// wireStubNotifier is the inner notifier center.Wrap always delegates to. It records nothing:
// this test is about what the PERSISTED record projects onto the Wails wire, and the dispatch
// leg is already covered by internal/notification/center's own tests.
type wireStubNotifier struct{}

// Notify accepts every notification and reports success.
func (wireStubNotifier) Notify(context.Context, notification.Notification) error { return nil }

// TestSuccessfulRunNotificationReachesTheWireWithItsRows is the end of the chain the empty
// detail pane broke. A successful download run's notification -- rows and all, exactly as the
// download producer now shapes it -- goes through the real persistence decorator and comes back
// out of the real Wails bindings. ListNotifications must report what the run was about, and
// GetNotification must hand the detail pane rows to render.
func TestSuccessfulRunNotificationReachesTheWireWithItsRows(t *testing.T) {
	t.Parallel()

	app := notificationCenterAppTestDB(t)
	notifier := center.Wrap(wireStubNotifier{}, app.notificationCenterStore)

	if err := notifier.Notify(app.notificationCenterCtx(), notification.Notification{
		Title:         "Download run completed",
		Body:          "3 episode(s) downloaded.",
		Level:         notification.LevelSuccess,
		Source:        "download",
		Kind:          "run_completed",
		CorrelationID: "run-8f21c4",
		Timestamp:     time.UnixMilli(1000).UTC(),
		Rows: []notification.DetailItem{
			{
				RefType: "anime", RefID: "anime-slime",
				Name:   "Tensei shitara Slime Datta Ken 4th Season",
				Status: "downloaded", Detail: "Episodes 14-16 -- ready to watch",
			},
			{Status: "ok", Detail: "6 other anime finished without incident", CollapsedCount: 6},
		},
		Actions: []notification.ActionSpec{
			{Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
			{Label: "Run this anime again", Intent: "download.run_anime", Args: map[string]string{"animeId": "anime-slime"}, RowRef: "anime-slime"},
		},
	}); err != nil {
		t.Fatalf("persist run_completed notification: %v", err)
	}

	page := app.ListNotifications(contracts.NotificationListRequest{Limit: 10})
	if page.Degraded || len(page.Items) != 1 {
		t.Fatalf("page = %#v, want exactly 1 non-degraded item", page)
	}
	listed := page.Items[0]
	if listed.RowCount != 7 {
		t.Fatalf("RowCount = %d, want 7 (the named anime + the 6 the summary row stands for) -- a successful run that reports 0 is the empty pane", listed.RowCount)
	}
	if len(listed.Subjects) != 1 || listed.Subjects[0] != "Tensei shitara Slime Datta Ken 4th Season" {
		t.Fatalf("Subjects = %#v, want the one anime the run actually downloaded", listed.Subjects)
	}

	detail := app.GetNotification(listed.ID)
	if detail.Degraded || !detail.Found {
		t.Fatalf("GetNotification = %#v, want a found, non-degraded record", detail)
	}
	if len(detail.Item.Rows) != 2 {
		t.Fatalf("detail Rows = %#v, want 2 (the downloaded anime + the collapsed summary)", detail.Item.Rows)
	}
	downloaded := detail.Item.Rows[0]
	if downloaded.RefType != "anime" || downloaded.RefID != "anime-slime" {
		t.Fatalf("detail Rows[0] = %#v, want the downloaded anime referenced as an anime row", downloaded)
	}
	if downloaded.Status != "downloaded" || downloaded.Detail != "Episodes 14-16 -- ready to watch" {
		t.Fatalf("detail Rows[0] = %#v, want Status=%q Detail=%q", downloaded, "downloaded", "Episodes 14-16 -- ready to watch")
	}
	if len(downloaded.ActionIDs) != 1 {
		t.Fatalf("detail Rows[0].ActionIDs = %#v, want exactly the one re-run token bound to that row", downloaded.ActionIDs)
	}
	if detail.Item.Rows[1].CollapsedCount != 6 {
		t.Fatalf("detail Rows[1].CollapsedCount = %d, want 6", detail.Item.Rows[1].CollapsedCount)
	}
}
