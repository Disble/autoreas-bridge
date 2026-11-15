package desktop

import (
	"database/sql"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

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
