package main

import (
	"context"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// stubDeviceStalenessStore is the narrow two-method seam notifyDeviceSyncHealth takes, so a test
// can drive the warning/stale branches without a real changelog store.
type stubDeviceStalenessStore struct {
	states []bridgeSync.DeviceSyncState
}

func (s *stubDeviceStalenessStore) EvaluateDeviceStaleness(context.Context, int64, int64, int64) ([]bridgeSync.DeviceSyncState, error) {
	return s.states, nil
}

func (s *stubDeviceStalenessStore) PruneAcknowledgedChangelog(context.Context) (int64, error) {
	return 0, nil
}

// TestNotifyDeviceSyncHealthNamesItsKind pins that BOTH device-sync-health branches name
// themselves. Without a kind the detail pane's metadata footer renders an absent row, leaving
// the record permanently unidentifiable there -- the notification says "Device marked stale" in
// its title and nothing at all in the vocabulary a filter or a reader can key on.
//
// Both branches share ONE kind on purpose (the design canvas draws exactly one sync-health kind
// among its blockless six), following the same precedent internal/download set when it collapsed
// partial/failed/stopped into download.run_stopped_early: the level and title still separate the
// two causes.
func TestNotifyDeviceSyncHealthNamesItsKind(t *testing.T) {
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
	for i, got := range notifier.received {
		if got.Kind != "sync_health_warning" {
			t.Fatalf("received[%d].Kind = %q, want %q", i, got.Kind, "sync_health_warning")
		}
		if got.Source != "sync" {
			t.Fatalf("received[%d].Source = %q, want %q -- kind never replaces source", i, got.Source, "sync")
		}
	}
	if notifier.received[0].Title == notifier.received[1].Title {
		t.Fatalf("both branches produced title %q; the shared kind is only defensible while the title still separates the two causes", notifier.received[0].Title)
	}
}

// TestOnPairingTokenConsumedNamesItsKind pins the device producer's kind. It is the one app-level
// producer whose canvas spelling is dotted, and it is taken verbatim rather than normalized to
// match its blockless neighbours.
func TestOnPairingTokenConsumedNamesItsKind(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{
		notifier: notifier,
		ctx:      context.Background(),
		emitFn:   func(context.Context, string, ...any) {},
	}

	app.onPairingTokenConsumed()()

	if len(notifier.received) != 1 {
		t.Fatalf("received %d notifications, want 1", len(notifier.received))
	}
	if got := notifier.received[0].Kind; got != "device.paired" {
		t.Fatalf("Kind = %q, want %q", got, "device.paired")
	}
	if got := notifier.received[0].Source; got != "device" {
		t.Fatalf("Source = %q, want %q", got, "device")
	}
}

// TestNotifySeasonPastDownloadWindowNamesItsKind pins the fourth kindless producer. Unlike the
// other three this event is drawn nowhere on the artboard, so its kind is chosen to sit in the
// same dotted season family as its sibling season.anime_available rather than invented in
// isolation.
func TestNotifySeasonPastDownloadWindowNamesItsKind(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}

	app.notifySeasonPastDownloadWindow(context.Background(), 3, "21:00")

	if len(notifier.received) != 1 {
		t.Fatalf("received %d notifications, want 1", len(notifier.received))
	}
	if got := notifier.received[0].Kind; got != "season.past_download_window" {
		t.Fatalf("Kind = %q, want %q", got, "season.past_download_window")
	}
	if got := notifier.received[0].Source; got != "season" {
		t.Fatalf("Source = %q, want %q", got, "season")
	}
}
