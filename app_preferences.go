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
