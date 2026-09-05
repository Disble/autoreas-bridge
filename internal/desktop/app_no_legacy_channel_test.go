package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// TestAppStartupSucceedsWithNoLegacyFileOnDisk covers the bridge-native-
// persistence spec's "Boot has zero Legacy file references" scenario
// (SDD-55 Slice A). Startup uses only the bootstrapped SQLite database --
// nothing in the App composition root resolves, opens, or waits on an
// animes.dat path.
func TestAppStartupSucceedsWithNoLegacyFileOnDisk(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		return bridgeSync.OpenBridgeDB(dbPath)
	}
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})

	app.startup(context.Background())

	if app.startupErr != nil {
		t.Fatalf("expected startup to succeed with no Legacy file on disk, got %v", app.startupErr)
	}
	if got := app.GetAnimes(); got == nil || len(got) != 0 {
		t.Fatalf("expected an empty (non-nil) catalog, got %#v", got)
	}
}

// TestAppStartupOnEmptyRealSQLiteServesEmptyCatalogWithoutWaiting covers the
// "Anime state is served without a Legacy fallback" scenario against a real
// (empty) bootstrapped bridge.db, proving there is no wait/catch-up loop
// gating the catalog on a Legacy file ever appearing.
func TestAppStartupOnEmptyRealSQLiteServesEmptyCatalogWithoutWaiting(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		return bridgeSync.OpenBridgeDB(dbPath)
	}
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})

	app.startup(context.Background())

	if app.startupErr != nil {
		t.Fatalf("expected startup to succeed on empty SQLite, got %v", app.startupErr)
	}
	if got := app.GetAnimes(); got == nil || len(got) != 0 {
		t.Fatalf("expected an empty (non-nil) catalog with no panic or wait, got %#v", got)
	}
}

// TestAppStructHasNoLegacyRuntimeChannelFields is the structural proof for
// "No Runtime Legacy Channel Remains": the App composition root no longer
// declares the SDD-48 watcher/catch-up/ownership-arbitration fields the
// SDD-55 cold cut retires. A field reappearing here means a Legacy runtime
// channel silently came back.
func TestAppStructHasNoLegacyRuntimeChannelFields(t *testing.T) {
	t.Parallel()

	appType := reflect.TypeFor[App]()
	for _, name := range []string{
		"animeRuntimeWatcher",
		"animeStartupCoordinator",
		"animeLegacyPull",
		"bridgeNativeRegistry",
		"newBridgeNativeRegistry",
		"restoreBridgeNativeAnimes",
		"resolveAnimeDataPath",
		"newStartupCoordinator",
		"newLegacyPullService",
		"newRuntimeWatcher",
	} {
		if _, ok := appType.FieldByName(name); ok {
			t.Fatalf("expected App struct to no longer declare field %q (Legacy runtime channel removed, SDD-55 Slice A)", name)
		}
	}
}
