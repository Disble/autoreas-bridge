package desktop

import (
	"context"
	"errors"
)

// errNoDownloadRunInProgress is CancelDownloadRun's error when no run is in flight.
var errNoDownloadRunInProgress = errors.New("no download run in progress")

// Stopping a download run in flight. The scheduler's concurrent-run guard means at
// most one run is ever active, so there is at most one thing to stop. Split out of
// app_download.go to keep that file under the repo file-length limit.

// setSoloDownloadCancel publishes the in-flight single-anime run's cancel func.
func (a *App) setSoloDownloadCancel(cancel context.CancelFunc) {
	a.soloDownloadCancelMu.Lock()
	defer a.soloDownloadCancelMu.Unlock()
	a.soloDownloadCancel = cancel
}

// clearSoloDownloadCancel drops the cancel func once its run has unwound, so a
// later stop request cannot cancel an already-finished run's context.
func (a *App) clearSoloDownloadCancel() {
	a.soloDownloadCancelMu.Lock()
	defer a.soloDownloadCancelMu.Unlock()
	a.soloDownloadCancel = nil
}

// CancelDownloadRun stops the download run currently in flight, whichever path
// started it: a scheduled/manual full check owned by the scheduler, or a
// single-anime catch-up owned by this App. The stopped run still writes its own
// terminal "canceled" row -- this only cancels the context it runs under, it never
// finalizes the row itself. With no run in flight the binding's error is
// errNoDownloadRunInProgress.
func (a *App) CancelDownloadRun() error {
	_, err := a.moduleSet().downloads.Use(func(s downloadServices) (struct{}, error) {
		canceled := s.scheduler.CancelRun()

		a.soloDownloadCancelMu.Lock()
		soloCancel := a.soloDownloadCancel
		a.soloDownloadCancelMu.Unlock()
		if soloCancel != nil {
			soloCancel()
			canceled = true
		}

		if !canceled {
			return struct{}{}, errNoDownloadRunInProgress
		}
		return struct{}{}, nil
	})
	return err
}
