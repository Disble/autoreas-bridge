package main

import (
	"context"
	"testing"

	"autoreas-bridge/internal/notification"
	bridgeSync "autoreas-bridge/internal/sync"
)

// singleWholeNotificationAction returns the notification's one whole-notification token, failing
// unless there is exactly one. Every app-level producer below raises a notification with no rows,
// so a token bound to a row would be addressing something that is not there.
func singleWholeNotificationAction(t *testing.T, sent notification.Notification) notification.ActionSpec {
	t.Helper()

	if len(sent.Actions) != 1 {
		t.Fatalf("actions = %#v, want exactly one whole-notification token", sent.Actions)
	}
	if sent.Actions[0].RowRef != "" {
		t.Fatalf("action = %#v, want it bound to no row", sent.Actions[0])
	}
	return sent.Actions[0]
}

// assertNavigatesTo fails unless the token opens the given route. Routes are written as literals
// so the assertion cannot pass against a rewritten route constant.
func assertNavigatesTo(t *testing.T, action notification.ActionSpec, label, route string) {
	t.Helper()

	if action.Label != label {
		t.Fatalf("action label = %q, want %q", action.Label, label)
	}
	if action.Intent != "navigation.open" {
		t.Fatalf("action intent = %q, want navigation.open", action.Intent)
	}
	if action.Args["route"] != route {
		t.Fatalf("frozen route = %q, want %q", action.Args["route"], route)
	}
}

// TestSeasonAvailableNotificationOpensTheSeasonSection: the notice lists anime available to
// create and, until now, offered no way to go create them. Its rows name what is available, and
// every one of them is created on the same screen -- so the verb belongs to the notification, not
// to each row (docs/notification-cta-policy.md, "L2 never navigates to a generic context").
func TestSeasonAvailableNotificationOpensTheSeasonSection(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}

	app.notifySeasonAvailable(context.Background(), []string{"Bocchi the Rock", "Frieren"})

	if len(notifier.received) != 1 {
		t.Fatalf("received %d notifications, want 1", len(notifier.received))
	}
	assertNavigatesTo(t, singleWholeNotificationAction(t, notifier.received[0]), "Open Season", "/season")
}

// TestSeasonAvailableNotificationLeavesItsRowsWithoutTokens guards the addition above from
// drifting into a per-row verb: every row would freeze the same route, which is L1 wearing L2's
// clothes.
func TestSeasonAvailableNotificationLeavesItsRowsWithoutTokens(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}

	app.notifySeasonAvailable(context.Background(), []string{"Bocchi the Rock"})

	sent := notifier.received[0]
	if len(sent.Rows) == 0 {
		t.Fatal("the notice named no anime, so the guard this test exists for was never exercised")
	}
	for _, action := range sent.Actions {
		if action.RowRef != "" {
			t.Fatalf("action %#v is bound to a row, want the verb at the notification level", action)
		}
	}
}

// TestPastDownloadWindowNotificationOffersToDownloadNow is the sharpest gap in the whole table:
// the body already tells the user to download manually, and offered nothing to do it with. Unlike
// every other addition here this is an OPERATION, not navigation -- the Daily Board's own
// "Download now" button behind a registered intent, so the durable record can do what its
// ephemeral banner could.
func TestPastDownloadWindowNotificationOffersToDownloadNow(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}

	app.notifySeasonPastDownloadWindow(context.Background(), 3, "09:30")

	action := singleWholeNotificationAction(t, notifier.received[0])
	if action.Label != "Download now" {
		t.Fatalf("action label = %q, want %q", action.Label, "Download now")
	}
	if action.Intent != "season.download_now" {
		t.Fatalf("action intent = %q, want season.download_now", action.Intent)
	}
}

// TestSyncHealthWarningNotificationOpensDevices covers BOTH branches: the device approaching the
// stale window and the one already past it. They share a kind, and they share a destination --
// the screen where a paired device is looked at.
func TestSyncHealthWarningNotificationOpensDevices(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}
	store := &stubDeviceStalenessStore{states: []bridgeSync.DeviceSyncState{
		{DeviceID: "d-1", SyncStatus: bridgeSync.DeviceSyncStatusWarning},
		{DeviceID: "d-2", SyncStatus: bridgeSync.DeviceSyncStatusStale},
	}}

	app.notifyDeviceSyncHealth(context.Background(), store)

	if len(notifier.received) != 2 {
		t.Fatalf("received %d notifications, want one per unhealthy device", len(notifier.received))
	}
	for i, sent := range notifier.received {
		t.Logf("branch %d: %s", i, sent.Title)
		assertNavigatesTo(t, singleWholeNotificationAction(t, sent), "Open Devices", "/devices")
	}
}
