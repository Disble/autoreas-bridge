package settings_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/settings"
)

// TestEpisodeRenameDefaultsOffOptsInTurnsOffAndStaysIndependentOfAutoStart
// reads renaming disabled while unset, writes it in both directions, and checks
// neither write moves the auto-start preference.
//
// Renaming rewrites files the user already owns, so unlike auto-start it must be
// something they turned on deliberately. The two toggles have opposite
// defaults, so a shared key only shows up when one writes the value the other
// reads as a change from its own default: FALSE for rename while auto-start is
// on, TRUE for rename while auto-start is off.
func TestEpisodeRenameDefaultsOffOptsInTurnsOffAndStaysIndependentOfAutoStart(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	assertEpisodeRename(t, store, false, "disabled until the user opts in")
	if err := store.SetEpisodeRenameEnabled(ctx, false); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled(false): %v", err)
	}
	assertAutoStart(t, store, true, "turning episode renaming off changed the auto-start preference")

	if err := store.SetAutoStartEnabled(ctx, false); err != nil {
		t.Fatalf("SetAutoStartEnabled: %v", err)
	}
	if err := store.SetEpisodeRenameEnabled(ctx, true); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled(true): %v", err)
	}
	assertEpisodeRename(t, store, true, "persisted episode-rename opt-in")
	assertAutoStart(t, store, false, "enabling episode renaming re-enabled auto-start")

	if err := store.SetEpisodeRenameEnabled(ctx, false); err != nil {
		t.Fatalf("SetEpisodeRenameEnabled(false): %v", err)
	}
	assertEpisodeRename(t, store, false, "episode renaming to go back off")
}

// assertEpisodeRename fails when the stored rename toggle differs from want.
func assertEpisodeRename(t *testing.T, store *settings.SQLiteStore, want bool, what string) {
	t.Helper()

	enabled, err := store.EpisodeRenameEnabled(context.Background())
	if err != nil {
		t.Fatalf("EpisodeRenameEnabled: %v", err)
	}
	if enabled != want {
		t.Fatalf("EpisodeRenameEnabled = %v, expected %s", enabled, what)
	}
}

// assertAutoStart fails with failure when the stored auto-start toggle differs from want.
func assertAutoStart(t *testing.T, store *settings.SQLiteStore, want bool, failure string) {
	t.Helper()

	enabled, err := store.AutoStartEnabled(context.Background())
	if err != nil {
		t.Fatalf("AutoStartEnabled: %v", err)
	}
	if enabled != want {
		t.Fatal(failure)
	}
}
