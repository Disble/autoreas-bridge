package desktop

import (
	"context"
	"embed"
	"path/filepath"
	"strings"
	"testing"

	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// dataDirEnv returns a getenv seam that names dataDir as the data directory override.
func dataDirEnv(dataDir string) func(string) string {
	return func(name string) string {
		if name == bridgeSync.DataDirEnvVar {
			return dataDir
		}
		return ""
	}
}

// newOverriddenAutoStartApp builds an App whose persisted auto-start preference is
// enabled and whose environment names a data directory override.
func newOverriddenAutoStartApp(t *testing.T, reconciler autoStartReconciler) *App {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store := settings.NewSQLiteStore(db)
	if err := store.SetAutoStartEnabled(context.Background(), true); err != nil {
		t.Fatalf("SetAutoStartEnabled: %v", err)
	}
	return &App{
		settingsStore:          store,
		newAutoStartReconciler: func() autoStartReconciler { return reconciler },
		getenvFn:               dataDirEnv(filepath.Join(t.TempDir(), "dev-data")),
	}
}

func TestReconcileAutoStartNeverTouchesTheRegistryFromADataDirCopy(t *testing.T) {
	t.Parallel()

	reconciler := &recordingAutoStartReconciler{}
	app := newOverriddenAutoStartApp(t, reconciler)

	app.reconcileAutoStart(context.Background())

	if reconciler.calls != 0 {
		t.Fatalf("reconciler calls = %d, want 0", reconciler.calls)
	}
}

func TestSetAutoStartEnabledPersistsButSkipsTheRegistryFromADataDirCopy(t *testing.T) {
	t.Parallel()

	reconciler := &recordingAutoStartReconciler{}
	app := newOverriddenAutoStartApp(t, reconciler)

	if got := app.SetAutoStartEnabled(false); got != "ok" {
		t.Fatalf("SetAutoStartEnabled = %q, want ok", got)
	}
	if reconciler.calls != 0 {
		t.Fatalf("reconciler calls = %d, want 0", reconciler.calls)
	}
	if app.GetAutoStartEnabled() {
		t.Fatal("expected the preference to persist as disabled")
	}
}

func TestBuildAppOptionsGivesADataDirCopyItsOwnSingleInstanceLock(t *testing.T) {
	t.Parallel()

	lockFor := func(getenv func(string) string) string {
		app := NewApp()
		app.getenvFn = getenv
		return buildAppOptions(app, embed.FS{}).SingleInstanceLock.UniqueId
	}
	devA := filepath.Join(t.TempDir(), "dev-a")
	devB := filepath.Join(t.TempDir(), "dev-b")

	if got := lockFor(dataDirEnv("")); got != "autoreas-bridge-single-instance" {
		t.Fatalf("lock without override = %q, want the shipped id", got)
	}
	a := lockFor(dataDirEnv(devA))
	if a == "autoreas-bridge-single-instance" || !strings.HasPrefix(a, "autoreas-bridge-single-instance-") {
		t.Fatalf("lock with override = %q, want the shipped id plus a suffix", a)
	}
	if b := lockFor(dataDirEnv(devB)); b == a {
		t.Fatalf("two data directories share lock %q", a)
	}
	same := strings.ToUpper(devA) + string(filepath.Separator)
	if got := lockFor(dataDirEnv(same)); got != a {
		t.Fatalf("lock for %q = %q, want %q (same directory)", same, got, a)
	}
}

func TestSetAutoStartEnabledReconcilesTheRegistryWithoutADataDirCopy(t *testing.T) {
	t.Parallel()

	reconciler := &recordingAutoStartReconciler{}
	app := newOverriddenAutoStartApp(t, reconciler)
	app.getenvFn = dataDirEnv("")

	if got := app.SetAutoStartEnabled(false); got != "ok" {
		t.Fatalf("SetAutoStartEnabled = %q, want ok", got)
	}
	if reconciler.calls != 1 || reconciler.enabled {
		t.Fatalf("reconciler calls = %d enabled = %v, want 1 call with false", reconciler.calls, reconciler.enabled)
	}
}

func TestAutoStartToleratesAMissingReconciler(t *testing.T) {
	t.Parallel()

	app := newOverriddenAutoStartApp(t, nil)
	app.getenvFn = dataDirEnv("")
	app.newAutoStartReconciler = nil

	app.reconcileAutoStart(context.Background())
	if got := app.SetAutoStartEnabled(false); got != "ok" {
		t.Fatalf("SetAutoStartEnabled = %q, want ok", got)
	}
}
