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

func TestDownloadsRootDefaultsToEmptyWhenUnset(t *testing.T) {
	store := newTestStore(t)
	got, err := store.DownloadsRoot(context.Background())
	if err != nil {
		t.Fatalf("DownloadsRoot: %v", err)
	}
	if got != "" {
		t.Fatalf("unset downloads root = %q, want empty", got)
	}
}

func TestSetDownloadsRootRoundTrips(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	want := filepath.Join("D:", "Anime")
	if err := store.SetDownloadsRoot(ctx, want); err != nil {
		t.Fatalf("SetDownloadsRoot: %v", err)
	}
	got, err := store.DownloadsRoot(ctx)
	if err != nil {
		t.Fatalf("DownloadsRoot: %v", err)
	}
	if got != want {
		t.Fatalf("downloads root = %q, want %q", got, want)
	}
}

func TestSetDownloadsRootUpsertsOverExisting(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	if err := store.SetDownloadsRoot(ctx, filepath.Join("D:", "Old")); err != nil {
		t.Fatalf("seed: %v", err)
	}
	want := filepath.Join("D:", "New")
	if err := store.SetDownloadsRoot(ctx, want); err != nil {
		t.Fatalf("SetDownloadsRoot (update): %v", err)
	}
	got, _ := store.DownloadsRoot(ctx)
	if got != want {
		t.Fatalf("downloads root = %q, want %q", got, want)
	}
}
