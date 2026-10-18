package desktop

import (
	"context"
	"errors"

	"autoreas-bridge/internal/schedule"
)

// RecheckSeasonAvailability triggers an out-of-band availability recheck now
// (the Daily Board's "Re-check now"). Reuses the scheduler run guard; an
// already-running recheck is reported as success.
func (a *App) RecheckSeasonAvailability() string {
	if a.seasonScheduler == nil {
		return "season availability unavailable"
	}
	if err := a.seasonScheduler.TriggerNow(a.seasonCtx(), "manual"); err != nil {
		if errors.Is(err, schedule.ErrRunInProgress) {
			return "ok"
		}
		return err.Error()
	}
	return "ok"
}

// seasonCtx returns a.ctx, falling back to context.Background() before startup.
func (a *App) seasonCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
