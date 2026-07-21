package main

import (
	"database/sql"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// configureStartupRuntimeDependencies installs startup dependencies for tests.
func configureStartupRuntimeDependencies(t *testing.T, app *App, wantDB *sql.DB) {
	t.Helper()
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return wantDB, nil }
	app.newUpdateWriter = func(config anime.UpdateWriterConfig) anime.UpdateWriter {
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
