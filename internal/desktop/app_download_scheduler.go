package desktop

import (
	"context"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/schedule"
)

// scheduleRunSettledEventName names the fact that the download scheduler has released its run
// guard and stored the run's outcome. It is both the Wails runtime event and the runtime_events
// event type, one name for one fact. download.run_finished fires earlier, from inside the run,
// so a schedule re-read on it can still show the run in progress; the Downloads read-model
// re-reads on this event to converge on the finished state.
const scheduleRunSettledEventName = "schedule.run_settled"

// startDownloadScheduler builds and starts the daily download scheduler over the download
// service, with the RunSettled hook below.
func (a *App) startDownloadScheduler(ctx context.Context) {
	a.downloadScheduler = a.newDownloadScheduler(schedule.Deps{
		Store:            a.downloadStore,
		Clock:            schedule.NewRealClock(),
		ProcessStartedAt: a.processStartedAt,
		Run: func(runCtx context.Context, trigger string) (string, error) {
			if a.downloadService == nil {
				return "", nil
			}
			result, err := a.downloadService.RunOnce(runCtx, trigger)
			return result.Status, err
		},
		RunSettled: a.scheduleRunSettled(ctx),
		Log:        a.sharedLogger,
	})
	a.downloadScheduler.Start(ctx)
}

// scheduleRunSettled is the download scheduler's RunSettled hook. It announces every settled run
// to the WebView, and records an outcome the scheduler stored as a schedule-domain info row, so
// Activity shows it as a Task line and the request MCP finds it under Where=schedule. The
// scheduler cannot write that row itself: it also runs Season's availability check, which is not
// a download. A manual run stores nothing, so it is announced and not logged.
func (a *App) scheduleRunSettled(ctx context.Context) func(schedule.RunSettlement) {
	return func(settlement schedule.RunSettlement) {
		if settlement.Recorded {
			a.sharedLogger.Logf("schedule", sharedlogger.LevelInfo, sharedlogger.Fields{
				EventType: scheduleRunSettledEventName,
				Metadata:  scheduleRunSettledMetadata(settlement),
			}, "%s download run recorded as %s", settlement.Trigger, settlement.Status)
		}
		if a.emitFn != nil {
			a.emitFn(ctx, scheduleRunSettledEventName)
		}
	}
}

// scheduleRunSettledMetadata keeps one fact per key and omits what the settlement does not
// know (a missed day has no stored times, a scheduled run no missed day).
func scheduleRunSettledMetadata(settlement schedule.RunSettlement) map[string]any {
	metadata := map[string]any{"trigger": settlement.Trigger, "status": settlement.Status}
	if settlement.StartedAtMs != 0 {
		metadata["startedAtMs"] = settlement.StartedAtMs
	}
	if settlement.NextRunAtMs != 0 {
		metadata["nextRunAtMs"] = settlement.NextRunAtMs
	}
	if settlement.LocalDate != "" {
		metadata["localDate"] = settlement.LocalDate
	}
	return metadata
}
