package main

import "context"

// Episode auto-rename bindings. Split out of app_download.go only to keep that
// file under the 400-line revive limit; they are ordinary download-settings
// bindings and follow the same nil-degradation convention as the rest.

// episodeRenameEnabled reads the episode-renaming opt-in, degrading to "off" for
// a missing store or a failed read: the safe direction for a setting whose only
// effect is rewriting files the user already has on disk.
func (a *App) episodeRenameEnabled(ctx context.Context) bool {
	if a.settingsStore == nil {
		return false
	}
	enabled, err := a.settingsStore.EpisodeRenameEnabled(ctx)
	return err == nil && enabled
}

// SetEpisodeRenameEnabled persists whether downloaded episodes are renamed to
// "<canonical anime name> - <NN>.<ext>". The download service re-reads the
// preference per episode, so the change applies to the next download without a
// Bridge restart.
func (a *App) SetEpisodeRenameEnabled(enabled bool) string {
	if a.settingsStore == nil {
		return "settings store unavailable"
	}
	if err := a.settingsStore.SetEpisodeRenameEnabled(a.downloadCtx(), enabled); err != nil {
		return err.Error()
	}
	return "ok"
}
