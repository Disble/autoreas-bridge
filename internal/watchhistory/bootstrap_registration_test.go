package watchhistory_test

import (
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// TestOpenBridgeDBRegistersWatchHistorySchema asserts the watch_history table
// is created through the real bootstrap path (OpenBridgeDB ->
// initializeBridgeDB), not just through this package's own openStoreTestDB
// helper -- SDD-69 slice 2 is the first slice that writes to it at runtime,
// so a missing registration there would make every live RecordWatch fail
// silently under anime.EpisodeService's degrade-on-error contract
// (design.md D4). This lives here rather than in internal/sync because
// tools/checkarchitecture forbids the literal "watch_history" outside this
// package -- OpenBridgeDB is internal/sync's exported entry point, so the
// real bootstrap is still what runs.
func TestOpenBridgeDBRegistersWatchHistorySchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	var name string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, "watch_history").Scan(&name); err != nil {
		t.Fatalf("expected OpenBridgeDB to create watch_history via the schema registry: %v", err)
	}
}
