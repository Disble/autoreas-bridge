package settings_test

import (
	"context"
	"testing"
)

// TestAutoStartDefaultsEnabledAndPreservesOptOut reads auto-start enabled while
// unset, then persists an opt-out.
func TestAutoStartDefaultsEnabledAndPreservesOptOut(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	enabled, err := store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if !enabled {
		t.Fatal("expected auto-start enabled by default")
	}

	if err := store.SetAutoStartEnabled(ctx, false); err != nil {
		t.Fatalf("SetAutoStartEnabled: %v", err)
	}
	enabled, err = store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if enabled {
		t.Fatal("expected persisted auto-start opt-out")
	}
}
