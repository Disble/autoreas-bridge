package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
)

// withSettingsStore wires store as the settings store of app through the production bind step
// and settles the settings module, so app's settings bindings serve store.
func withSettingsStore(app *App, store appSettingsStore) *App {
	if app.ctx == nil {
		app.ctx = context.Background()
	}
	app.settingsStore = store
	app.bindSettingsModule()
	app.settleModules(moduleSettings)
	return app
}

// settingsApp returns an App whose settings module serves a real settings store when ready.
// Starting and failed apps get untouchableSettingsStore, so a binding that reached its store
// before checking the module would panic.
func settingsApp(t *testing.T, state lifecycle.State) *App {
	app := &App{ctx: context.Background()}
	if state != lifecycle.StateReady {
		app.settingsStore = untouchableSettingsStore{}
		app.bindSettingsModule()
		return inModuleState(app, moduleSettings, state)
	}
	return withSettingsStore(app, newRenameSettingsStore(t))
}

// untouchableSettingsStore panics on any call: its nil embedded port has no methods to run.
type untouchableSettingsStore struct{ appSettingsStore }

// failingSettingsStore fails every settings read and write the settings bindings make,
// standing in for a locked settings database.
type failingSettingsStore struct{ appSettingsStore }

// errSettingsDisk is the failure failingSettingsStore answers.
var errSettingsDisk = errors.New("settings disk I/O error")

func (failingSettingsStore) LibraryRoot(context.Context) (string, error)  { return "", errSettingsDisk }
func (failingSettingsStore) SetLibraryRoot(context.Context, string) error { return errSettingsDisk }
func (failingSettingsStore) AutoStartEnabled(context.Context) (bool, error) {
	return true, errSettingsDisk
}
func (failingSettingsStore) SetAutoStartEnabled(context.Context, bool) error { return errSettingsDisk }
func (failingSettingsStore) SetEpisodeRenameEnabled(context.Context, bool) error {
	return errSettingsDisk
}
func (failingSettingsStore) APIAddr(context.Context) (string, error)          { return "", errSettingsDisk }
func (failingSettingsStore) SetAPIAddr(context.Context, string) error         { return errSettingsDisk }
func (failingSettingsStore) SetSeasonCheckTime(context.Context, string) error { return errSettingsDisk }
func (failingSettingsStore) Keymap(context.Context) (string, error)           { return "", errSettingsDisk }
func (failingSettingsStore) SetKeymap(context.Context, string) error          { return errSettingsDisk }

// settingsModuleBindings is every binding the settings module serves, each reporting whether it
// served a value.
var settingsModuleBindings = []struct {
	name string
	call func(*App) (bool, error)
}{
	{"GetLibraryRoot", func(a *App) (bool, error) { _, err := a.GetLibraryRoot(); return true, err }},
	{"SetLibraryRoot", func(a *App) (bool, error) { return true, a.SetLibraryRoot(`D:\Anime`) }},
	{"PreviewLibraryRootChange", func(a *App) (bool, error) {
		got, err := a.PreviewLibraryRootChange(`D:\Anime`)
		return got.Moves != nil && got.Kept != nil, err
	}},
	{"GetAutoStartEnabled", func(a *App) (bool, error) { _, err := a.GetAutoStartEnabled(); return true, err }},
	{"SetAutoStartEnabled", func(a *App) (bool, error) { return true, a.SetAutoStartEnabled(false) }},
	{"GetAPIAddress", func(a *App) (bool, error) { _, err := a.GetAPIAddress(); return true, err }},
	{"SetAPIAddress", func(a *App) (bool, error) { return true, a.SetAPIAddress("9999") }},
	{"SetEpisodeRenameEnabled", func(a *App) (bool, error) { return true, a.SetEpisodeRenameEnabled(true) }},
	{"GetSeasonCheckTime", func(a *App) (bool, error) { got, err := a.GetSeasonCheckTime(); return got != "", err }},
	{"SetSeasonCheckTime", func(a *App) (bool, error) { return true, a.SetSeasonCheckTime("07:30") }},
	{"GetKeymap", func(a *App) (bool, error) { _, err := a.GetKeymap(); return true, err }},
	{"SetKeymap", func(a *App) (bool, error) { return true, a.SetKeymap(`{"version":1,"overrides":{}}`) }},
}

// TestSettingsBindingsFollowTheSettingsModule pins S1 for settings: no binding answers a default,
// an empty value or a status string while the module starts or after it failed, and none
// reaches the settings store before the module is ready.
func TestSettingsBindingsFollowTheSettingsModule(t *testing.T) {
	t.Parallel()
	for _, binding := range settingsModuleBindings {
		app := settingsApp(t, lifecycle.StateStarting)
		assertStartingThenFailed(t, binding.name, app, moduleSettings, "settings is starting", binding.call)
		served, err := binding.call(settingsApp(t, lifecycle.StateReady))
		assertModuleAnswer(t, binding.name+" ready", served, err, "", "")
	}
}

// TestSettingsStoreFailuresAreInternal pins that a failing settings store reaches the frontend as
// an internal failure with its cause, never as a default value or a status string.
func TestSettingsStoreFailuresAreInternal(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		call func(*App) error
	}{
		{"GetLibraryRoot", func(a *App) error {
			got, err := a.GetLibraryRoot()
			if got != "" {
				t.Errorf("GetLibraryRoot answered %q beside its error", got)
			}
			return err
		}},
		{"SetLibraryRoot", func(a *App) error { return a.SetLibraryRoot(`D:\Anime`) }},
		{"PreviewLibraryRootChange", func(a *App) error { _, err := a.PreviewLibraryRootChange(`D:\Anime`); return err }},
		{"GetAutoStartEnabled", func(a *App) error {
			got, err := a.GetAutoStartEnabled()
			if got {
				t.Error("GetAutoStartEnabled answered true beside its error")
			}
			return err
		}},
		{"SetAutoStartEnabled", func(a *App) error { return a.SetAutoStartEnabled(false) }},
		{"GetAPIAddress", func(a *App) error { _, err := a.GetAPIAddress(); return err }},
		{"SetAPIAddress", func(a *App) error { return a.SetAPIAddress("9999") }},
		{"SetEpisodeRenameEnabled", func(a *App) error { return a.SetEpisodeRenameEnabled(true) }},
		{"SetSeasonCheckTime", func(a *App) error { return a.SetSeasonCheckTime("07:30") }},
		{"GetKeymap", func(a *App) error {
			got, err := a.GetKeymap()
			if got != "" {
				t.Errorf("GetKeymap answered %q beside its error", got)
			}
			return err
		}},
		{"SetKeymap", func(a *App) error { return a.SetKeymap(`{"version":1,"overrides":{}}`) }},
	}
	for _, tc := range cases {
		err := tc.call(withSettingsStore(&App{}, failingSettingsStore{}))

		code, _ := apperr.CodeOf(err)
		if code != apperr.CodeInternal || !errors.Is(err, errSettingsDisk) {
			t.Errorf("%s: err = %v (code %q), want internal wrapping %v", tc.name, err, code, errSettingsDisk)
		}
	}
}

// TestSettingsBindingsRefuseBadInputAsInvalidArgument pins that a rejected value is an
// invalid_argument failure carrying the message the settings screens show.
func TestSettingsBindingsRefuseBadInputAsInvalidArgument(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		call    func(*App) error
		wantMsg string
	}{
		{"SetAPIAddress", func(a *App) error { return a.SetAPIAddress("not-a-port") }, `"not-a-port" is not a usable port or address`},
		{"SetSeasonCheckTime", func(a *App) error { return a.SetSeasonCheckTime("9:00") }, `invalid time "9:00": use HH:MM (00:00-23:59)`},
	}
	for _, tc := range cases {
		err := tc.call(withSettingsStore(&App{}, untouchableSettingsStore{}))

		if code, _ := apperr.CodeOf(err); code != apperr.CodeInvalidArgument || err.Error() != tc.wantMsg {
			t.Errorf("%s: err = %v (code %q), want invalid_argument %q", tc.name, err, code, tc.wantMsg)
		}
	}
}
