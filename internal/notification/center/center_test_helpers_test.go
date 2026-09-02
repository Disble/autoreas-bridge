package center

import (
	"database/sql"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// openBootstrappedTestDB opens a temporary, fully bootstrapped bridge SQLite
// database (every domain's schema, including notification_records and
// notification_record_actions) so center's tests exercise the exact schema
// production wires rather than a hand-rolled subset. Importing internal/sync
// here is deliberate and safe: it is confined to _test.go files, which never
// appear in `go list -deps` (no -test flag), so it cannot trip the
// import-boundary guard (import_boundary_test.go) that forbids center's
// production code from depending on internal/sync.
func openBootstrappedTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bootstrapped bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
