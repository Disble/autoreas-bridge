package desktop

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/schedule"
)

// startSoloDownload resolves animeIDs and runs them in the background as one App-owned download
// run -- the single-anime catch-up and the season's chosen Ver hoy subset. It refuses while the
// scheduler reports a run or another solo run holds the guard, and it releases the solo-run guard
// on every refusal. Scheduler runs do not take this guard, so one can still start beside a solo
// run. Returns "ok" once the run has started.
func (a *App) startSoloDownload(animeIDs []string, run func(ctx context.Context, animes []contracts.MobileAnime)) string {
	if a.animeQuery == nil {
		return "anime query unavailable"
	}
	if a.downloadService == nil {
		return "download service unavailable"
	}
	if a.downloadScheduler != nil && a.downloadScheduler.Status(a.downloadCtx()).Running {
		return schedule.ErrRunInProgress.Error()
	}
	if !a.soloDownloadMu.TryLock() {
		return schedule.ErrRunInProgress.Error()
	}

	animes := make([]contracts.MobileAnime, 0, len(animeIDs))
	for _, id := range animeIDs {
		anime, err := a.animeQuery.GetMobileAnime(a.downloadCtx(), id)
		if err != nil {
			a.soloDownloadMu.Unlock()
			return err.Error()
		}
		if anime == nil {
			a.soloDownloadMu.Unlock()
			return "anime not found"
		}
		animes = append(animes, *anime)
	}

	// The solo run is owned by the App, not the scheduler, so it needs its own
	// cancel for CancelDownloadRun to be able to stop it.
	runCtx, cancel := context.WithCancel(a.downloadCtx())
	a.setSoloDownloadCancel(cancel)

	go func() {
		defer a.soloDownloadMu.Unlock()
		defer a.clearSoloDownloadCancel()
		defer cancel()
		run(runCtx, animes)
	}()

	return "ok"
}
