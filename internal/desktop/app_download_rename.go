package desktop

import "context"

// Episode auto-rename bindings. Split out of app_download.go only to keep that
// file under the 400-line revive limit. The binding is a settings-module binding;
// the read below is the download service's seam and degrades to "off".

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
// Bridge restart. It runs through the settings module handle.
func (a *App) SetEpisodeRenameEnabled(enabled bool) error {
	_, err := a.moduleSet().settings.Use(func(services settingsServices) (struct{}, error) {
		return struct{}{}, services.store.SetEpisodeRenameEnabled(a.downloadCtx(), enabled)
	})
	return err
}
