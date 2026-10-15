package settings_test

import (
	"context"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// newTestStore opens a temporary settings store for tests.
func newTestStore(t *testing.T) *settings.SQLiteStore {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return settings.NewSQLiteStore(db)
}

func TestLibraryRootDefaultsToEmptyWhenUnset(t *testing.T) {
	store := newTestStore(t)
	got, err := store.LibraryRoot(context.Background())
	if err != nil {
		t.Fatalf("LibraryRoot: %v", err)
	}
	if got != "" {
		t.Fatalf("unset library root = %q, want empty", got)
	}
}

func TestSetLibraryRootRoundTrips(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	want := filepath.Join("D:", "Anime")
	if err := store.SetLibraryRoot(ctx, want); err != nil {
		t.Fatalf("SetLibraryRoot: %v", err)
	}
	got, err := store.LibraryRoot(ctx)
	if err != nil {
		t.Fatalf("LibraryRoot: %v", err)
	}
	if got != want {
		t.Fatalf("library root = %q, want %q", got, want)
	}
}

// TestSetLibraryRootUpsertsOverExisting seeds the existing root the way a
// database written before ADR 027 holds it -- under the retired
// "downloads.root" key -- so reopening must migrate it to "library.root" and
// drop the old key before the upsert replaces it.
func TestSetLibraryRootUpsertsOverExisting(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "bridge.db")
	legacy, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	if _, err := legacy.ExecContext(ctx, `INSERT INTO app_settings (key, value) VALUES ('downloads.root', ?)`, filepath.Join("D:", "Old")); err != nil {
		t.Fatalf("seed legacy key: %v", err)
	}
	_ = legacy.Close()

	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("reopen bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store := settings.NewSQLiteStore(db)
	if got, _ := store.LibraryRoot(ctx); got != filepath.Join("D:", "Old") {
		t.Fatalf("migrated library root = %q, want %q", got, filepath.Join("D:", "Old"))
	}
	if legacyValue, _ := store.Get(ctx, "downloads.root"); legacyValue != "" {
		t.Fatalf("legacy downloads.root still holds %q after migration", legacyValue)
	}
	want := filepath.Join("D:", "New")
	if err := store.SetLibraryRoot(ctx, want); err != nil {
		t.Fatalf("SetLibraryRoot (update): %v", err)
	}
	got, _ := store.LibraryRoot(ctx)
	if got != want {
		t.Fatalf("library root = %q, want %q", got, want)
	}
}
