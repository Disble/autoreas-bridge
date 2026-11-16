package desktop

import (
	"context"
	"errors"

	"autoreas-bridge/internal/schedule"
)

// errSeasonAvailabilityUnavailable is RecheckSeasonAvailability's failure while
// the daily availability scheduler is not running.
var errSeasonAvailabilityUnavailable = errors.New("season availability unavailable")

// RecheckSeasonAvailability triggers an out-of-band availability recheck now
// (the Daily Board's "Re-check now") through the season module handle. Reuses
// the scheduler run guard; an already-running recheck is reported as success.
// The scheduler starts after the season module is ready (startSeasonAvailability),
// so it is resolved here, when the recheck runs: none yet, or none because the
// availability wiring was skipped, is errSeasonAvailabilityUnavailable.
func (a *App) RecheckSeasonAvailability() error {
	_, err := a.moduleSet().season.Use(func(seasonServices) (struct{}, error) {
		if a.seasonScheduler == nil {
			return struct{}{}, errSeasonAvailabilityUnavailable
		}
		err := a.seasonScheduler.TriggerNow(a.seasonCtx(), "manual")
		if errors.Is(err, schedule.ErrRunInProgress) {
			return struct{}{}, nil
		}
		return struct{}{}, err
	})
	return err
}

// seasonCtx returns a.ctx, falling back to context.Background() before startup.
func (a *App) seasonCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
