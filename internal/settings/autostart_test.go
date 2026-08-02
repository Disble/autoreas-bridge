package settings_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/settings"
)

func TestSQLiteStoreWithoutDatabaseReturnsError(t *testing.T) {
	store := settings.NewSQLiteStore(nil)

	_, err := store.AutoStartEnabled(context.Background())
	if err == nil {
		t.Fatal("expected an error when settings store has no database")
	}
}

func TestAutoStartDefaultsEnabledWhenUnset(t *testing.T) {
	store := newTestStore(t)

	enabled, err := store.AutoStartEnabled(context.Background())
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if !enabled {
		t.Fatal("expected auto-start enabled by default")
	}
}

func TestSetAutoStartEnabledPreservesOptOut(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetAutoStartEnabled(ctx, false); err != nil {
		t.Fatalf("SetAutoStartEnabled: %v", err)
	}
	enabled, err := store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if enabled {
		t.Fatal("expected persisted auto-start opt-out")
	}
}
