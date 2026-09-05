package desktop

import (
	"context"
	"errors"

	"autoreas-bridge/internal/api/contracts"
)

// Download readiness, split out of app_download.go when that file crossed the 400-line revive
// ceiling. Both entry points here answer the same question -- which catalog anime can actually
// download right now -- for two different callers: the Wails-bound screen read, and the download
// service's own seam, which a scheduled run uses to warn about the anime it is about to skip.

// ListDownloadReadiness returns the current local readiness snapshot. Query failures are
// returned to Wails so the frontend cannot mistake an unavailable snapshot for an empty catalog.
//
// The screen has no run of its own to scope the query to, so it reads through the app-wide
// context; everything else about the read is shared with the download service's seam below.
func (a *App) ListDownloadReadiness() (contracts.DownloadReadinessSnapshot, error) {
	return a.downloadReadinessSnapshot(a.downloadCtx())
}

// downloadReadinessSnapshot is the download service's readiness seam
// (download.ServiceDeps.Readiness): the channel a scheduled run uses to learn
// which of the anime it is about to skip cannot download at all.
//
// It takes the caller's context rather than a.downloadCtx(), unlike the
// Wails-bound ListDownloadReadiness beside it. The caller here is one download
// run, and a run that is stopped or times out must take its catalog query with
// it instead of leaving it running against the app-wide context.
//
// It resolves a.readinessService on the call instead of closing over it,
// because startDownloadOrchestration builds the download service BEFORE the
// readiness service exists. The download side degrades a returned error to
// silence by design, so this never has to be safe to ignore -- only safe to
// fail.
func (a *App) downloadReadinessSnapshot(ctx context.Context) (contracts.DownloadReadinessSnapshot, error) {
	if a.readinessService == nil {
		// Logged, not just returned: a nil service means startup never reached
		// startDownloadOrchestration, and without this line the failure is
		// invisible on both sides -- Wails rejects with a bare string and the
		// UI used to replace it with a generic sentence, while the download
		// service degrades it to silence.
		a.logReadinessFailure("download readiness service was never wired during startup")
		return contracts.DownloadReadinessSnapshot{}, errors.New("download readiness unavailable: service not wired at startup")
	}
	snapshot, err := a.readinessService.BuildSnapshot(ctx)
	if err != nil {
		a.logReadinessFailure(err.Error())
		return contracts.DownloadReadinessSnapshot{}, err
	}
	return snapshot, nil
}

// logReadinessFailure records why a readiness snapshot could not be built, so the
// cause survives even when the caller only shows a generic message.
func (a *App) logReadinessFailure(reason string) {
	if a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Warnf("download", "list download readiness failed: %s", reason)
}
