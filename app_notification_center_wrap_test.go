package main

import (
	"context"
	"path/filepath"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestStartupWrapsNotifierWhenBridgeDBUsable asserts the positive
// Wrap-applied path (design §5.9): when canUseBridgeDB reports true, startup
// wires notificationCenterStore and replaces a.notifier with the wrapping
// *center.Service, so its identity differs from the bare value newNotifier
// returned. This is new evidence for the positive path; it does not touch
// app_startup_test.go:136's existing negative-path assertion, which is
// re-run unmodified by that same suite (both exercise the same
// canUseBridgeDB gate from opposite sides).
func TestStartupWrapsNotifierWhenBridgeDBUsable(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	realDB, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bootstrapped bridge db: %v", err)
	}
	t.Cleanup(func() { _ = realDB.Close() })

	fake := &stubAppNotifier{}
	app := newAppTestApp(t)
	configureStartupRuntimeDependencies(t, app, realDB)
	app.newNotifier = func(emit func(ctx context.Context, eventName string, optionalData ...any), loggers ...sharedlogger.Logger) notification.Notifier {
		return fake
	}

	app.startup(context.Background())

	if app.notificationCenterStore == nil {
		t.Fatal("expected startup to construct notificationCenterStore over a usable bridge DB")
	}
	if app.notifier == fake {
		t.Fatal("expected startup to wrap the bare notifier into a persisting decorator; identity must differ")
	}
}
