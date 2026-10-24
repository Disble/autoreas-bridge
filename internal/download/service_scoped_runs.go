package download

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

// The scoped download runs: the same pipeline RunOnce drives, over animes the caller already
// chose instead of today's scheduled selection.

// RunAnime executes the same catch-up pipeline as RunOnce, but scoped to a single already
// selected anime. The caller owns selection/concurrency policy; the service still persists a
// normal download_runs row and emits the same download lifecycle events so the Downloads UI and
// run history refresh without a second code path.
func (s *Service) RunAnime(ctx context.Context, trigger string, anime contracts.MobileAnime) (RunResult, error) {
	runID := s.deps.NewRunID()
	startedAt := s.deps.Clock()

	run := Run{
		RunID:       runID,
		StartedAtMs: startedAt.UnixMilli(),
		Trigger:     trigger,
		Status:      "running",
	}
	if s.deps.Store != nil {
		if err := s.deps.Store.OpenRun(ctx, run); err != nil {
			return RunResult{}, fmt.Errorf("download: open run %q: %w", runID, err)
		}
	}

	s.logf(logger.LevelInfo, runID, anime.ID, "download.run_started", map[string]any{"trigger": trigger, "animeName": anime.Name},
		"download run %s started (trigger=%s, anime=%s)", runID, trigger, anime.Name)
	s.publish(events.DownloadRunStartedEvent{RunID: runID, Trigger: trigger, CorrelationID: runID})
	s.notify(ctx, runNotification{
		level:   notification.LevelInfo,
		kind:    kindRunStarted,
		runID:   runID,
		title:   "Anime download started",
		body:    fmt.Sprintf("Download check started for %s.", anime.Name),
		rows:    buildRunStartedRows([]contracts.MobileAnime{anime}),
		actions: runWideActions(kindRunStarted, runID),
	})

	result := s.executeAnimeLive(ctx, runID, &run, anime)
	s.finishRunLog(runID, &run)

	return result, nil
}

// RunAnimes executes the RunOnce pipeline over the animes the caller hands it instead of today's
// scheduled selection -- the season "Download now" over a chosen Ver hoy subset. The caller owns
// selection and concurrency policy, exactly as for RunAnime; the run persists, announces itself
// and finalizes like any RunOnce pass.
func (s *Service) RunAnimes(ctx context.Context, trigger string, animes []contracts.MobileAnime) (RunResult, error) {
	return s.runSelection(ctx, trigger, func(context.Context) ([]contracts.MobileAnime, error) {
		return animes, nil
	})
}
