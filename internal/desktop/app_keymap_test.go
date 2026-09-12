package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/settings"
)

func TestGetKeymapEmptyWithoutASettingsStore(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = nil

	if got := app.GetKeymap(); got != "" {
		t.Fatalf("GetKeymap = %q, want empty when settings are unavailable", got)
	}
}

func TestSetKeymapUnavailableWithoutASettingsStore(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = nil

	if got := app.SetKeymap(`{"version":1,"overrides":{}}`); got != "settings store unavailable" {
		t.Fatalf("SetKeymap = %q, want \"settings store unavailable\"", got)
	}
}

func TestSetKeymapRoundTripsThroughSettings(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if got := app.GetKeymap(); got != "" {
		t.Fatalf("GetKeymap = %q, want empty before anything is bound", got)
	}
	document := `{"version":1,"overrides":{"nav.today":"ctrl+1"}}`
	if result := app.SetKeymap(document); result != "ok" {
		t.Fatalf("SetKeymap = %q, want \"ok\"", result)
	}
	if got := app.GetKeymap(); got != document {
		t.Fatalf("GetKeymap = %q, want the persisted document", got)
	}
}

func TestSetKeymapEmptyClearsAnExistingDocument(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if result := app.SetKeymap(`{"version":1,"overrides":{"nav.today":"ctrl+1"}}`); result != "ok" {
		t.Fatalf("SetKeymap = %q, want \"ok\"", result)
	}
	if result := app.SetKeymap(""); result != "ok" {
		t.Fatalf("SetKeymap(\"\") = %q, want \"ok\"", result)
	}
	if got := app.GetKeymap(); got != "" {
		t.Fatalf("GetKeymap = %q, want empty after clearing", got)
	}
}

// failingKeymapStore embeds a real settings store and overrides only
// SetKeymap, mirroring failingRenameSettingsStore in
// app_download_rename_test.go -- it forces the error branch SetKeymap is
// otherwise untestable through, while still satisfying appSettingsStore.
type failingKeymapStore struct {
	*settings.SQLiteStore
}

func (failingKeymapStore) SetKeymap(context.Context, string) error {
	return errors.New("keymap unwritable")
}

func TestSetKeymapSurfacesAStoreError(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = failingKeymapStore{SQLiteStore: newRenameSettingsStore(t)}

	if got := app.SetKeymap(`{"version":1,"overrides":{}}`); got != "keymap unwritable" {
		t.Fatalf("SetKeymap = %q, want the store error surfaced", got)
	}
}
