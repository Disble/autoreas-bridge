package desktop

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// newRenameSettingsStore opens a real bridge DB so the preference round-trips
// through the same app_settings table production uses.
func newRenameSettingsStore(t *testing.T) *settings.SQLiteStore {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("OpenBridgeDB: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return settings.NewSQLiteStore(db)
}

// failingRenameSettingsStore fails every episode-rename read and write, standing
// in for a corrupted or locked settings database.
type failingRenameSettingsStore struct {
	*settings.SQLiteStore
}

func (failingRenameSettingsStore) EpisodeRenameEnabled(context.Context) (bool, error) {
	return true, errors.New("settings unreadable")
}

func (failingRenameSettingsStore) SetEpisodeRenameEnabled(context.Context, bool) error {
	return errors.New("settings unwritable")
}

func TestSetEpisodeRenameEnabledPersistsTheOptIn(t *testing.T) {
	t.Parallel()

	app := &App{settingsStore: newRenameSettingsStore(t)}

	if result := app.SetEpisodeRenameEnabled(true); result != "ok" {
		t.Fatalf("SetEpisodeRenameEnabled = %q, want \"ok\"", result)
	}
	if !app.episodeRenameEnabled(context.Background()) {
		t.Fatal("expected the opt-in to be readable back")
	}
}

func TestEpisodeRenameIsOffUntilTheUserOptsIn(t *testing.T) {
	t.Parallel()

	app := &App{settingsStore: newRenameSettingsStore(t)}

	if app.episodeRenameEnabled(context.Background()) {
		t.Fatal("expected episode renaming off before the user opts in")
	}
}

func TestSetEpisodeRenameEnabledReportsAMissingSettingsStore(t *testing.T) {
	t.Parallel()

	app := &App{}

	if app.SetEpisodeRenameEnabled(true) == "ok" {
		t.Fatal("SetEpisodeRenameEnabled reported ok with no settings store")
	}
	if app.episodeRenameEnabled(context.Background()) {
		t.Fatal("expected episode renaming off with no settings store")
	}
}

func TestSetEpisodeRenameEnabledSurfacesAWriteFailure(t *testing.T) {
	t.Parallel()

	app := &App{settingsStore: failingRenameSettingsStore{newRenameSettingsStore(t)}}

	if app.SetEpisodeRenameEnabled(true) == "ok" {
		t.Fatal("SetEpisodeRenameEnabled reported ok despite a write failure")
	}
}

// A failed read must mean "do not rename". The stub deliberately returns
// (true, error) so a check that ignores the error would enable renaming off the
// back of an unreadable setting.
func TestEpisodeRenameStaysOffWhenTheSettingCannotBeRead(t *testing.T) {
	t.Parallel()

	app := &App{settingsStore: failingRenameSettingsStore{newRenameSettingsStore(t)}}

	if app.episodeRenameEnabled(context.Background()) {
		t.Fatal("expected episode renaming off when the preference cannot be read")
	}
}

func TestGetDownloadConfigReportsTheEpisodeRenamePreference(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.startup(context.Background())
	// startup installs a settings store over the harness's unusable stub DB, so
	// the real one has to replace it afterwards.
	app.settingsStore = newRenameSettingsStore(t)

	if app.GetDownloadConfig().RenameEpisodes {
		t.Fatal("RenameEpisodes = true before the user opted in")
	}
	if result := app.SetEpisodeRenameEnabled(true); result != "ok" {
		t.Fatalf("SetEpisodeRenameEnabled = %q, want \"ok\"", result)
	}
	if !app.GetDownloadConfig().RenameEpisodes {
		t.Fatal("RenameEpisodes = false after the user opted in")
	}
}
