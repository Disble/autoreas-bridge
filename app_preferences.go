package main

import "context"

// GetSeasonMode reports whether the bridge is in season mode. Season mode is a
// DERIVED state (SDD-41b): it is on exactly while a season is open. The manual
// Options toggle was removed — the Season section is the single source of truth,
// so opening a season turns season mode on and closing it turns it off.
func (a *App) GetSeasonMode() bool {
	return a.seasonModeReader()(a.seasonCtx())
}

// seasonModeReader returns a ctx-aware reader for the derived season-mode flag,
// shared by the download selection seam (ServiceDeps.SeasonMode) and the
// mobile-facing status read-model (StatusService). It is true iff a season is
// open; it degrades to false when the season service is unavailable or errors.
func (a *App) seasonModeReader() func(context.Context) bool {
	return func(ctx context.Context) bool {
		if a.seasonService == nil {
			return false
		}
		active, err := a.seasonService.ActiveSeason(ctx)
		return err == nil && active != nil
	}
}

// GetDownloadsRoot returns the configured global downloads root, or "" when it
// has never been set. It degrades to "" when the settings store is unavailable.
func (a *App) GetDownloadsRoot() string {
	if a.settingsStore == nil {
		return ""
	}
	root, err := a.settingsStore.DownloadsRoot(a.seasonCtx())
	if err != nil {
		return ""
	}
	return root
}

// SetDownloadsRoot persists the global downloads root — the base folder joined
// with a sanitized anime name to form a newly-created season anime's default
// download folder. Returns "ok" or an error string.
func (a *App) SetDownloadsRoot(path string) string {
	if a.settingsStore == nil {
		return "settings store unavailable"
	}
	if err := a.settingsStore.SetDownloadsRoot(a.seasonCtx(), path); err != nil {
		return err.Error()
	}
	return "ok"
}

// PickFolder opens the native directory picker and returns the chosen absolute
// path, or "" when the user cancels (or no runtime is available). Shared by the
// Options downloads-root setting and the per-anime folder override in intake.
func (a *App) PickFolder(title string) string {
	if a.pickFolder == nil {
		return ""
	}
	path, err := a.pickFolder(a.seasonCtx(), title)
	if err != nil {
		return ""
	}
	return path
}

// PickFile opens the native file picker (filtered to image types) and returns
// the chosen absolute path, or "" when the user cancels (or no runtime is
// available). Backs the reusable path-picker field for on-disk anime covers.
func (a *App) PickFile(title string) string {
	if a.pickFile == nil {
		return ""
	}
	path, err := a.pickFile(a.seasonCtx(), title)
	if err != nil {
		return ""
	}
	return path
}
