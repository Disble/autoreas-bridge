package settings_test

import (
	"context"
	"testing"
)

func TestKeymapDefaultsToEmptyWhenUnset(t *testing.T) {
	store := newTestStore(t)
	got, err := store.Keymap(context.Background())
	if err != nil {
		t.Fatalf("Keymap: %v", err)
	}
	if got != "" {
		t.Fatalf("unset keymap = %q, want empty", got)
	}
}

func TestSetKeymapRoundTrips(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	want := `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`
	if err := store.SetKeymap(ctx, want); err != nil {
		t.Fatalf("SetKeymap: %v", err)
	}
	got, err := store.Keymap(ctx)
	if err != nil {
		t.Fatalf("Keymap: %v", err)
	}
	if got != want {
		t.Fatalf("keymap = %q, want %q", got, want)
	}
}

func TestSetKeymapEmptyClearsAnExistingDocument(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	if err := store.SetKeymap(ctx, `{"version":1,"overrides":{}}`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := store.SetKeymap(ctx, ""); err != nil {
		t.Fatalf(`SetKeymap(""): %v`, err)
	}
	got, err := store.Keymap(ctx)
	if err != nil {
		t.Fatalf("Keymap: %v", err)
	}
	if got != "" {
		t.Fatalf("keymap after clear = %q, want empty", got)
	}
}

// TestKeymapRoundTripsOpaqueBytesUnchanged is the deterministic guard named in
// design.md D5.3: Go must never parse or validate the keymap document.
// normalizeChord (TypeScript, frontend/src/shared/keyboard/keymap.helpers.ts)
// is the sole authority on chord grammar. The document below is deliberately
// neither valid JSON nor a valid chord; if a future change adds any Go-side
// validation of this document, this test turns red.
func TestKeymapRoundTripsOpaqueBytesUnchanged(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	garbage := `{not json: alt++`
	if err := store.SetKeymap(ctx, garbage); err != nil {
		t.Fatalf("SetKeymap: %v", err)
	}
	got, err := store.Keymap(ctx)
	if err != nil {
		t.Fatalf("Keymap: %v", err)
	}
	if got != garbage {
		t.Fatalf("keymap = %q, want byte-identical %q", got, garbage)
	}
}
