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
	// Push the change to connected mobile clients in realtime so their global
	// season-mode state updates the instant it is toggled, instead of waiting for
	// the next cold GET /api/status read. The bridge is the sole source of truth
	// (read-only on mobile), so a one-way broadcast is sufficient.
	if a.realtimeHub != nil {
		a.realtimeHub.BroadcastPreferencesChanged(a.preferencesCtx(), enabled)
	}
	return "ok"
}

// seasonModeReader returns a ctx-aware reader for the bridge-owned global season-mode
// flag, degrading to false when the preferences store is unavailable or errors. Shared
// by the download selection seam (ServiceDeps.SeasonMode) and the mobile-facing status
// read-model (StatusService) so both observe the exact same source of truth.
func (a *App) seasonModeReader() func(context.Context) bool {
	return func(ctx context.Context) bool {
		if a.preferencesStore == nil {
			return false
		}
		enabled, err := a.preferencesStore.SeasonMode(ctx)
		if err != nil {
			return false
		}
		return enabled
	}
}

// preferencesCtx returns a.ctx, falling back to context.Background() before startup has
// set it — mirrors downloadCtx().
func (a *App) preferencesCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
