package download

import (
	"context"
	"fmt"
	"sync"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

// executeAnimeLive runs the download pipeline for one anime and finalizes its run. Like
// executeAnimes, it defers EnsureOnline behind a lazy jdGate: JDownloader is never launched
// unless the single anime actually has a missing episode.
func (s *Service) executeAnimeLive(ctx context.Context, runID string, run *Run, anime contracts.MobileAnime) RunResult {
	var runMu sync.Mutex
	gate := s.newJDGateForRun(ctx, runID, run, &runMu)

	applyDelta := func(delta animeProgressDelta) {
		runMu.Lock()
		applyProgressDelta(run, delta)
		snapshot := cloneRun(*run)
		runMu.Unlock()
		s.recordProgress(ctx, &snapshot)
	}

	outcome := s.processAnime(ctx, runID, anime, gate, applyDelta)

	if s.markCanceled(ctx, runID, run, []animeRunOutcome{outcome}) {
		s.finalize(ctx, run)
		return RunResult{RunID: runID, Status: run.Status}
	}

	switch {
	case gate.knownOffline() && len(run.ManualLinks) > 0:
		run.Status = RunStatusJDOffline
		// Same as the fan-out path: the row's verb follows its own outcome, so a hoster-blocked
		// anime offers the link rather than a re-run against a downloader that is still offline.
		s.notifyWithOutcomes(ctx, notification.LevelWarning, kindJDownloaderOffline, runID, "MyJDownloader offline",
			fmt.Sprintf("%d episode(s) need manual download: %s.", len(run.ManualLinks), summarizeManualLinks(run.ManualLinks, manualLinksSummaryLimit)),
			[]animeRunOutcome{outcome})
	case outcome.failed && run.EpisodesDownloaded > 0:
		run.Status = RunStatusPartial
		s.notifyWithOutcomes(ctx, notification.LevelWarning, kindRunStoppedEarly, runID,
			"Download run completed with errors", "Some episodes failed to download.", []animeRunOutcome{outcome})
	case outcome.failed:
		run.Status = RunStatusError
		s.notifyWithOutcomes(ctx, notification.LevelError, kindRunStoppedEarly, runID,
			"Download run failed", "The selected anime failed to download.", []animeRunOutcome{outcome})
	default:
		run.Status = RunStatusOK
		if run.EpisodesDownloaded > 0 {
			s.notifyWithOutcomes(ctx, notification.LevelSuccess, kindRunCompleted, runID,
				"Download run completed", fmt.Sprintf("%d episode(s) downloaded.", run.EpisodesDownloaded),
				[]animeRunOutcome{outcome})
		}
	}

	s.finalize(ctx, run)
	return RunResult{RunID: runID, Status: run.Status}
}

// finishRunLog records and publishes the terminal run summary.
func (s *Service) finishRunLog(runID string, run *Run) {
	s.logf(logger.LevelInfo, runID, "", "download.run_finished", map[string]any{
		"status":              run.Status,
		"animes_checked":      run.AnimesChecked,
		"episodes_found":      run.EpisodesFound,
		"episodes_downloaded": run.EpisodesDownloaded,
		"episodes_failed":     run.EpisodesFailed,
		"skipped_count":       run.SkippedCount,
		"up_to_date_count":    run.UpToDateCount,
	}, "download run %s finished with status %s", runID, run.Status)
	s.publish(events.DownloadRunFinishedEvent{RunID: runID, Status: run.Status, CorrelationID: runID})
}
