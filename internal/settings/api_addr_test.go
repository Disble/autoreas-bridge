package settings_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/settings"
)

// TestEveryPreferenceReadFailsWithoutADatabase checks a store built without a
// database refuses each preference read instead of returning a default.
func TestEveryPreferenceReadFailsWithoutADatabase(t *testing.T) {
	store := settings.NewSQLiteStore(nil)
	ctx := context.Background()

	if _, err := store.APIAddr(ctx); err == nil {
		t.Fatal("APIAddr: expected an error when settings store has no database")
	}
	if _, err := store.AutoStartEnabled(ctx); err == nil {
		t.Fatal("AutoStartEnabled: expected an error when settings store has no database")
	}
	if _, err := store.EpisodeRenameEnabled(ctx); err == nil {
		t.Fatal("EpisodeRenameEnabled: expected an error when settings store has no database")
	}
}

// TestAPIAddrDefaultsEmptyPersistsStaysIndependentAndClears reads the unset
// address, persists one, checks it leaves the other preferences alone, and
// clears it back to unset.
//
// Empty is the "not configured" signal the resolver reads as "use the default",
// so the default lives in one place instead of being copied into the database.
// Clearing has to be reachable, otherwise a user who sets a port can never get
// back to whatever the shipped default becomes later. Auto-start defaults to
// enabled, so reading it as disabled after writing an address is what a shared
// key would look like.
func TestAPIAddrDefaultsEmptyPersistsStaysIndependentAndClears(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	assertAPIAddr(t, store, "", "until the user configures one")
	if err := store.SetAPIAddr(ctx, "0.0.0.0:9999"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}
	assertAPIAddr(t, store, "0.0.0.0:9999", "after setting it")

	autoStart, err := store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if !autoStart {
		t.Fatal("writing the api address changed the auto-start preference")
	}
	root, err := store.LibraryRoot(ctx)
	if err != nil {
		t.Fatalf("LibraryRoot: %v", err)
	}
	if root != "" {
		t.Fatalf("writing the api address leaked into the library root: %q", root)
	}

	if err := store.SetAPIAddr(ctx, ""); err != nil {
		t.Fatalf("SetAPIAddr(\"\"): %v", err)
	}
	assertAPIAddr(t, store, "", "after clearing")
}

// assertAPIAddr fails when the stored api address differs from want.
func assertAPIAddr(t *testing.T, store *settings.SQLiteStore, want, when string) {
	t.Helper()

	addr, err := store.APIAddr(context.Background())
	if err != nil {
		t.Fatalf("APIAddr: %v", err)
	}
	if addr != want {
		t.Fatalf("APIAddr = %q, want %q %s", addr, want, when)
	}
}
