package desktop

import (
	"database/sql"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// openInMemorySQLite opens a temporary in-memory SQLite database for tests.
func openInMemorySQLite(t *testing.T) (*sql.DB, error) {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, nil
}

// openRuntimeBridgeDB opens a temporary bridge database for runtime tests.
func openRuntimeBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
