package preferences

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// openTestPreferencesDB opens a real bridge.db in a temp dir and bootstraps the full
// schema (including app_settings via initializeBridgeDB → ensureAppSettingsSchema).
func openTestPreferencesDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open test preferences db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// TestSQLiteStoreSeasonModeRoundTripTrue verifies that enabling season mode persists and
// returns true.
func TestSQLiteStoreSeasonModeRoundTripTrue(t *testing.T) {
	t.Parallel()
	db := openTestPreferencesDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetSeasonMode(ctx, true); err != nil {
		t.Fatalf("SetSeasonMode(true): %v", err)
	}

	got, err := store.SeasonMode(ctx)
	if err != nil {
		t.Fatalf("SeasonMode: %v", err)
	}
	if !got {
		t.Fatal("expected SeasonMode to return true after SetSeasonMode(true)")
	}
}

// TestSQLiteStoreSeasonModeRoundTripFalse verifies that disabling season mode after enabling
// persists and returns false.
func TestSQLiteStoreSeasonModeRoundTripFalse(t *testing.T) {
	t.Parallel()
	db := openTestPreferencesDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetSeasonMode(ctx, true); err != nil {
		t.Fatalf("SetSeasonMode(true): %v", err)
	}
	if err := store.SetSeasonMode(ctx, false); err != nil {
		t.Fatalf("SetSeasonMode(false): %v", err)
	}

	got, err := store.SeasonMode(ctx)
	if err != nil {
		t.Fatalf("SeasonMode: %v", err)
	}
	if got {
		t.Fatal("expected SeasonMode to return false after SetSeasonMode(false)")
	}
}

// TestSQLiteStoreSeasonModeMissingRowReturnsFalse verifies that a missing row in app_settings
// defaults to false with no error — the "missing row IS default false" invariant.
func TestSQLiteStoreSeasonModeMissingRowReturnsFalse(t *testing.T) {
	t.Parallel()
	db := openTestPreferencesDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	got, err := store.SeasonMode(ctx)
	if err != nil {
		t.Fatalf("SeasonMode on empty table returned error: %v", err)
	}
	if got {
		t.Fatal("expected SeasonMode to return false when no row exists")
	}
}

// TestSQLiteStoreSeasonModeUpsertOverwrites verifies that a second SetSeasonMode call
// overwrites the previous value (upsert semantics — no duplicate-key error).
func TestSQLiteStoreSeasonModeUpsertOverwrites(t *testing.T) {
	t.Parallel()
	db := openTestPreferencesDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	for i := range 5 {
		enabled := i%2 == 0
		if err := store.SetSeasonMode(ctx, enabled); err != nil {
			t.Fatalf("SetSeasonMode(%v) on iteration %d: %v", enabled, i, err)
		}
	}
	// After 5 iterations (0,1,2,3,4) last value is enabled=false (index 4, 4%2==0 → true).
	// Actually: index 4 → enabled = (4%2==0) = true. Let's read and verify.
	got, err := store.SeasonMode(ctx)
	if err != nil {
		t.Fatalf("SeasonMode after upserts: %v", err)
	}
	if !got {
		t.Fatal("expected SeasonMode to be true after final SetSeasonMode(true) at index 4")
	}
}

// TestSQLiteStoreSeasonModeIdempotentDDL verifies that calling the DDL bootstrap twice does
// not corrupt existing data — the CREATE TABLE IF NOT EXISTS invariant.
func TestSQLiteStoreSeasonModeIdempotentDDL(t *testing.T) {
	t.Parallel()
	db := openTestPreferencesDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetSeasonMode(ctx, true); err != nil {
		t.Fatalf("SetSeasonMode before second DDL: %v", err)
	}

	// Re-running the DDL (simulates second app startup) must not fail or erase the row.
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatalf("second DDL run: %v", err)
	}

	got, err := store.SeasonMode(ctx)
	if err != nil {
		t.Fatalf("SeasonMode after second DDL: %v", err)
	}
	if !got {
		t.Fatal("expected existing row to survive second DDL run")
	}
}
