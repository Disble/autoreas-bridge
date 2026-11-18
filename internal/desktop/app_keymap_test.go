package desktop

import "testing"

// TestKeymapRoundTripsThroughTheSettingsModule pins the keymap's persisted semantics through the
// handle: no customization answers "" with no error, a saved document reads back verbatim, and
// saving "" clears it back to the shipped defaults.
func TestKeymapRoundTripsThroughTheSettingsModule(t *testing.T) {
	t.Parallel()

	app := withSettingsStore(&App{}, newRenameSettingsStore(t))

	if got, err := app.GetKeymap(); err != nil || got != "" {
		t.Fatalf("GetKeymap = %q, %v; want empty and no error before anything is bound", got, err)
	}
	document := `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`
	if err := app.SetKeymap(document); err != nil {
		t.Fatalf("SetKeymap: %v", err)
	}
	if got, err := app.GetKeymap(); err != nil || got != document {
		t.Fatalf("GetKeymap = %q, %v; want the persisted document", got, err)
	}
	if err := app.SetKeymap(""); err != nil {
		t.Fatalf("SetKeymap(\"\"): %v", err)
	}
	if got, err := app.GetKeymap(); err != nil || got != "" {
		t.Fatalf("GetKeymap = %q, %v; want empty after clearing", got, err)
	}
}
