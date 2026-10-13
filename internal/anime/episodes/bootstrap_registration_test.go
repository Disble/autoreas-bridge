package episodes_test

import (
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// TestOpenBridgeDBRegistersEpisodeDurationSchema asserts both tables are
// created through the real bootstrap path (OpenBridgeDB), not only through
// this package's test helper: a missing registration would make every
// duration write fail at runtime. It lives here because
// tools/checkarchitecture forbids the table names outside this package.
func TestOpenBridgeDBRegistersEpisodeDurationSchema(t *testing.T) {
	t.Parallel()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	for _, table := range []string{"anime_episode_durations", "durations_pending_announce"} {
		var name string
		if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name); err != nil {
			t.Fatalf("expected OpenBridgeDB to create %s via the schema registry: %v", table, err)
		}
	}
}
