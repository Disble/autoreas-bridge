package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// TestAppShutdownClosesBootstrappedDatabase is the preserved counterpart of
// TestAppShutdownAfterFailedBootstrapDoesNotPanic: a bootstrap that succeeds
// still hands shutdown a database it owns, and shutdown still closes that real
// SQLite file handle. Without that close a restart on the same file would see a
// locked database instead of a clean one.
func TestAppShutdownClosesBootstrappedDatabase(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }

	app.startup(context.Background())
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}
	db := app.bridgeDB
	if db == nil {
		t.Fatal("expected startup to retain the bootstrapped database handle")
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("ping before shutdown: %v", err)
	}

	app.shutdown(context.Background())

	if err := db.Ping(); err == nil {
		t.Fatal("expected shutdown to close the bootstrapped database handle")
	}
}
