package desktop

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

func TestReconcileAutoStartSkipsUnavailableSettingsDatabase(t *testing.T) {
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	reconciler := &recordingAutoStartReconciler{}
	app := &App{
		settingsStore:          settings.NewSQLiteStore(nil),
		newAutoStartReconciler: func() autoStartReconciler { return reconciler },
		sharedLogger:           sharedlogger.NewFanoutLogger(memLogger),
	}

	app.reconcileAutoStart(context.Background())

	if reconciler.calls != 0 {
		t.Fatalf("reconciler calls = %d, want 0", reconciler.calls)
	}
	if entries := memLogger.Recent(); len(entries) != 0 {
		t.Fatalf("unexpected unavailable-settings log entries: %#v", entries)
	}
}

func TestStartupContinuesWithUnusableSettingsStore(t *testing.T) {
	app := newAppTestApp(t)
	reconciler := &recordingAutoStartReconciler{}
	app.newAutoStartReconciler = func() autoStartReconciler { return reconciler }

	app.startup(context.Background())

	if app.startupErr != nil {
		t.Fatalf("startup error = %v, want nil", app.startupErr)
	}
	if reconciler.calls != 0 {
		t.Fatalf("reconciler calls = %d, want 0", reconciler.calls)
	}
}

func TestReconcileAutoStartUsesPersistedPreference(t *testing.T) {
	t.Parallel()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store := settings.NewSQLiteStore(db)
	if err := store.SetAutoStartEnabled(context.Background(), false); err != nil {
		t.Fatalf("SetAutoStartEnabled: %v", err)
	}
	reconciler := &recordingAutoStartReconciler{}
	app := &App{
		settingsStore:          store,
		newAutoStartReconciler: func() autoStartReconciler { return reconciler },
	}

	app.reconcileAutoStart(context.Background())

	if reconciler.calls != 1 {
		t.Fatalf("reconciler calls = %d, want 1", reconciler.calls)
	}
	if reconciler.enabled {
		t.Fatal("reconciler enabled = true, want false")
	}
}

func TestStartupContinuesWhenAutoStartRegistrationFails(t *testing.T) {
	t.Parallel()

	manager := &tray.MockTrayManager{}
	app := newAppTestApp(t)
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return db, nil }
	app.newTrayManager = func() tray.Manager { return manager }
	reconciler := &erroringAutoStartReconciler{}
	app.newAutoStartReconciler = func() autoStartReconciler { return reconciler }
	app.hideWindow = func(context.Context) {}

	app.startup(context.Background())

	if !manager.Started {
		t.Fatal("expected tray startup to continue after auto-start registration failure")
	}
	if reconciler.calls != 1 {
		t.Fatalf("reconciler calls = %d, want 1", reconciler.calls)
	}
	if app.startupErr != nil {
		t.Fatalf("startup error = %v, want nil", app.startupErr)
	}
}

type recordingAutoStartReconciler struct {
	calls   int
	enabled bool
}

func (r *recordingAutoStartReconciler) Reconcile(enabled bool) error {
	r.calls++
	r.enabled = enabled
	return nil
}

type erroringAutoStartReconciler struct {
	calls int
}

func (r *erroringAutoStartReconciler) Reconcile(bool) error {
	r.calls++
	return errors.New("registry unavailable")
}
