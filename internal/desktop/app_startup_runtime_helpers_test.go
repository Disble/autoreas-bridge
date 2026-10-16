package desktop

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
	app.newCommittedPublisher = func(bus events.Bus) anime.CommittedPublisher {
		if bus == nil {
			t.Fatal("expected the committed publisher to receive the event bus")
		}
		// No publisher: startup recovery stays off this test's database.
		return nil
	}
	app.newChangelogStore = func(db *sql.DB) changelogPendingInserter {
		if db == nil {
			t.Fatal("expected changelog store to receive sqlite db")
		}
		return &stubAppChangelogStore{}
	}
	app.newChangelogRecorder = func(bus events.Bus, store changelogPendingInserter, _ ...sharedlogger.Logger) changelogRecorder {
		if bus == nil {
			t.Fatal("expected changelog recorder to receive event bus")
		}
		if store == nil {
			t.Fatal("expected changelog recorder to receive changelog store")
		}
		return &stubAppChangelogRecorder{}
	}
}
