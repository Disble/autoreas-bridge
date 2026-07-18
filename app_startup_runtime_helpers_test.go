package main

import (
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// configureStartupRuntimeDependencies installs startup dependencies for tests.
func configureStartupRuntimeDependencies(t *testing.T, app *App, wantDB *sql.DB, coordinator anime.StartupCoordinator) {
	t.Helper()
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return wantDB, nil }
	app.resolveAnimeDataPath = func() (string, error) {
		return filepath.Join("C:\\Users\\User\\AppData\\Roaming\\Autoreas\\data", "animes.dat"), nil
	}
	app.newStartupCoordinator = func(config anime.StartupCoordinatorConfig) anime.StartupCoordinator {
		assertStartupFilePath(t, config.FilePath, "startup coordinator")
		return coordinator
	}
	app.newRuntimeWatcher = func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
		assertStartupFilePath(t, config.FilePath, "runtime watcher")
		return &stubAppRuntimeWatcher{}
	}
	app.newUpdateWriter = func(config anime.UpdateWriterConfig) anime.UpdateWriter {
		assertStartupFilePath(t, config.FilePath, "update writer")
		if config.Bus == nil {
			t.Fatal("expected update writer config to include event bus")
		}
		return &stubAppUpdateWriter{}
	}
	app.newChangelogStore = func(db *sql.DB) changelogPendingStore {
		if db == nil {
			t.Fatal("expected changelog store to receive sqlite db")
		}
		return &stubAppChangelogStore{}
	}
	app.newChangelogRecorder = func(bus events.Bus, store changelogPendingStore, _ ...sharedlogger.Logger) changelogRecorder {
		if bus == nil {
			t.Fatal("expected changelog recorder to receive event bus")
		}
		if store == nil {
			t.Fatal("expected changelog recorder to receive changelog store")
		}
		return &stubAppChangelogRecorder{}
	}
}

// assertStartupFilePath verifies that a startup dependency receives a data path.
func assertStartupFilePath(t *testing.T, filePath string, target string) {
	t.Helper()
	if filePath == "" {
		t.Fatalf("expected %s config to include anime data path", target)
	}
}
