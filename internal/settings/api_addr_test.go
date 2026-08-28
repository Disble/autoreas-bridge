package settings_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/settings"
)

func TestAPIAddrStoreWithoutDatabaseReturnsError(t *testing.T) {
	store := settings.NewSQLiteStore(nil)

	if _, err := store.APIAddr(context.Background()); err == nil {
		t.Fatal("expected an error when settings store has no database")
	}
}

// Empty is the "not configured" signal the resolver reads as "use the default".
// It has to stay empty rather than materialising an address here, so that the
// default lives in one place instead of being copied into the database the
// first time anybody reads it.
func TestAPIAddrDefaultsEmptyWhenUnset(t *testing.T) {
	store := newTestStore(t)

	addr, err := store.APIAddr(context.Background())
	if err != nil {
		t.Fatalf("APIAddr: %v", err)
	}
	if addr != "" {
		t.Fatalf("APIAddr = %q, want empty until the user configures one", addr)
	}
}

func TestSetAPIAddrPersistsTheConfiguredValue(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetAPIAddr(ctx, "0.0.0.0:9999"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}
	addr, err := store.APIAddr(ctx)
	if err != nil {
		t.Fatalf("APIAddr: %v", err)
	}
	if addr != "0.0.0.0:9999" {
		t.Fatalf("APIAddr = %q, want %q", addr, "0.0.0.0:9999")
	}
}

// Clearing has to be reachable, otherwise a user who sets a port can never get
// back to whatever the shipped default becomes later.
func TestSetAPIAddrClearsBackToUnset(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetAPIAddr(ctx, "0.0.0.0:9999"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}
	if err := store.SetAPIAddr(ctx, ""); err != nil {
		t.Fatalf("SetAPIAddr(\"\"): %v", err)
	}
	addr, err := store.APIAddr(ctx)
	if err != nil {
		t.Fatalf("APIAddr: %v", err)
	}
	if addr != "" {
		t.Fatalf("APIAddr = %q, want empty after clearing", addr)
	}
}

// The address key must not collide with the other preferences. Auto-start
// defaults to enabled, so reading it as disabled after writing an address is
// what a shared key would look like.
func TestAPIAddrIsIndependentOfTheOtherPreferences(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetAPIAddr(ctx, "0.0.0.0:9999"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}

	autoStart, err := store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if !autoStart {
		t.Fatal("writing the api address changed the auto-start preference")
	}

	root, err := store.DownloadsRoot(ctx)
	if err != nil {
		t.Fatalf("DownloadsRoot: %v", err)
	}
	if root != "" {
		t.Fatalf("writing the api address leaked into the downloads root: %q", root)
	}
}
