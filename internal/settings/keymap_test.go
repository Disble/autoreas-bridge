package settings_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/settings"
)

// TestKeymapDefaultsEmptyRoundTripsOpaqueBytesAndClears reads the unset keymap,
// round-trips a document, round-trips bytes that are neither valid JSON nor a
// valid chord unchanged, and clears an existing document.
//
// Go must never parse or validate the keymap document (design.md D5.3):
// normalizeChord in frontend/src/shared/keyboard/keymap.helpers.ts is the sole
// authority on chord grammar, so any Go-side validation turns this test red.
func TestKeymapDefaultsEmptyRoundTripsOpaqueBytesAndClears(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	assertKeymap(t, store, "")
	document := `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`
	if err := store.SetKeymap(ctx, document); err != nil {
		t.Fatalf("SetKeymap: %v", err)
	}
	assertKeymap(t, store, document)
	garbage := `{not json: alt++`
	if err := store.SetKeymap(ctx, garbage); err != nil {
		t.Fatalf("SetKeymap(garbage): %v", err)
	}
	assertKeymap(t, store, garbage)
	if err := store.SetKeymap(ctx, ""); err != nil {
		t.Fatalf(`SetKeymap(""): %v`, err)
	}
	assertKeymap(t, store, "")
}

// assertKeymap fails when the stored keymap is not byte-identical to want.
func assertKeymap(t *testing.T, store *settings.SQLiteStore, want string) {
	t.Helper()

	got, err := store.Keymap(context.Background())
	if err != nil {
		t.Fatalf("Keymap: %v", err)
	}
	if got != want {
		t.Fatalf("keymap = %q, want byte-identical %q", got, want)
	}
}
