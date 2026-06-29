package main

import "context"

// GetSeasonMode returns the persisted season-mode flag. Degrades to false when the
// preferences store is unavailable or returns an error — never panics.
func (a *App) GetSeasonMode() bool {
	if a.preferencesStore == nil {
		return false
	}
	enabled, err := a.preferencesStore.SeasonMode(a.preferencesCtx())
	if err != nil {
		return false
	}
	return enabled
}

// SetSeasonMode persists the season-mode flag. Returns "ok" on success, a non-empty
// descriptive string when the store is unavailable, or err.Error() on write failure.
// Mirrors the app_download.go setter convention (design §DRIFT).
func (a *App) SetSeasonMode(enabled bool) string {
	if a.preferencesStore == nil {
		return "preferences store unavailable"
	}
	if err := a.preferencesStore.SetSeasonMode(a.preferencesCtx(), enabled); err != nil {
		return err.Error()
	}
	return "ok"
}

// preferencesCtx returns a.ctx, falling back to context.Background() before startup has
// set it — mirrors downloadCtx().
func (a *App) preferencesCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
