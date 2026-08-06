package settings_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/settings"
)

func TestEpisodeRenameStoreWithoutDatabaseReturnsError(t *testing.T) {
	store := settings.NewSQLiteStore(nil)

	if _, err := store.EpisodeRenameEnabled(context.Background()); err == nil {
		t.Fatal("expected an error when settings store has no database")
	}
}

// Renaming rewrites files the user already owns, so unlike auto-start it must be
// something they turned on deliberately -- never something a new Bridge version
// starts doing to their library on its own.
func TestEpisodeRenameDefaultsDisabledWhenUnset(t *testing.T) {
	store := newTestStore(t)

	enabled, err := store.EpisodeRenameEnabled(context.Background())
	if err != nil {
		t.Fatalf("EpisodeRenameEnabled: %v", err)
	}
	if enabled {
		t.Fatal("expected episode renaming disabled until the user opts in")
	}
}

func TestSetEpisodeRenameEnabledPersistsOptIn(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetEpisodeRenameEnabled(ctx, true); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled: %v", err)
	}
	enabled, err := store.EpisodeRenameEnabled(ctx)
	if err != nil {
		t.Fatalf("EpisodeRenameEnabled: %v", err)
	}
	if !enabled {
		t.Fatal("expected persisted episode-rename opt-in")
	}
}

func TestSetEpisodeRenameEnabledPersistsTurningItBackOff(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetEpisodeRenameEnabled(ctx, true); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled(true): %v", err)
	}
	if err := store.SetEpisodeRenameEnabled(ctx, false); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled(false): %v", err)
	}
	enabled, err := store.EpisodeRenameEnabled(ctx)
	if err != nil {
		t.Fatalf("EpisodeRenameEnabled: %v", err)
	}
	if enabled {
		t.Fatal("expected episode renaming to go back off")
	}
}

// The rename toggle and the auto-start toggle must not share a key. Writing
// FALSE is the direction that proves it: the two preferences have opposite
// defaults, so a shared key only shows up when one writes the value the other
// reads as a change from its own default. Writing true would leave auto-start
// looking enabled either way and prove nothing.
func TestEpisodeRenameIsIndependentOfAutoStart(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	if err := store.SetEpisodeRenameEnabled(ctx, false); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled: %v", err)
	}

	autoStart, err := store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if !autoStart {
		t.Fatal("turning episode renaming off changed the auto-start preference")
	}

	if err := store.SetAutoStartEnabled(ctx, false); err != nil {
		t.Fatalf("SetAutoStartEnabled: %v", err)
	}
	if err := store.SetEpisodeRenameEnabled(ctx, true); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled: %v", err)
	}
	autoStart, err = store.AutoStartEnabled(ctx)
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if autoStart {
		t.Fatal("enabling episode renaming re-enabled auto-start")
	}
}
