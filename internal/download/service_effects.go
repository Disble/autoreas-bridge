// Package download (this file) holds the orchestration Service's side-effect seams extracted from
// service.go: run-row persistence (finalize/recordProgress/markScheduledRun) and the event-bus,
// user-notification, and structured-logging fan-outs (publish/notify/logf). Each degrades silently
// on a nil dependency so a run never fails on an observability side-effect. This is a pure
// structural split (same package, unchanged behavior) that keeps service.go within the repo's
// effective-line budget (docs/file-size-policy.md).
package download

import (
	"context"
	"time"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

func (s *Service) finalize(ctx context.Context, run *DownloadRun) {
	finishedAt := s.deps.Clock().UnixMilli()
	run.FinishedAtMs = &finishedAt
	if s.deps.Store == nil {
		return
	}
	if err := s.deps.Store.FinalizeRun(ctx, *run); err != nil {
		s.logf(logger.LevelError, run.RunID, "", "download.failed", nil,
			"failed to finalize run %s: %v", run.RunID, err)
	}
}

func (s *Service) recordProgress(ctx context.Context, run *DownloadRun) {
	if s.deps.Store == nil {
		return
	}
	if err := s.deps.Store.UpdateRunProgress(ctx, *run); err != nil {
		s.logf(logger.LevelWarn, run.RunID, "", "download.run_progress", nil,
			"failed to update run %s progress: %v", run.RunID, err)
		return
	}
	s.publish(events.DownloadRunProgressEvent{RunID: run.RunID, CorrelationID: run.RunID})
}

func (s *Service) markScheduledRun(ctx context.Context, trigger string, startedAt time.Time, run *DownloadRun) {
	if trigger != "scheduled" || s.deps.Store == nil {
		return
	}

	nextRunAtMs := int64(0)
	if cfg, err := s.deps.Store.GetScheduleConfig(ctx); err == nil {
		nextRunAtMs = cfg.NextRunAtMs
	}

	if err := s.deps.Store.MarkScheduleRun(ctx, startedAt.UnixMilli(), run.Status, nextRunAtMs); err != nil {
		s.logf(logger.LevelWarn, run.RunID, "", "download.schedule_mark_failed", nil,
			"failed to mark scheduled run %s: %v", run.RunID, err)
	}
}

// publish fans a download.* domain event out to the Bus (design.md §8 "Download Events on the
// Event Bus"). This is DISTINCT from notify's user-facing Notifier calls (design §14.1 -- a
// backend event is not a user notification); both are emitted for the same notable moments where
// the design calls for it. A nil Bus dependency degrades silently rather than panicking.
func (s *Service) publish(event events.Event) {
	if s.deps.Bus == nil {
		return
	}
	s.deps.Bus.Publish(event)
}

func (s *Service) notify(ctx context.Context, level notification.Level, runID, title, body string) {
	if s.deps.Notifier == nil {
		return
	}
	// Notifier failures must never fail the run (Notifier's own contract already requires
	// fan-out isolation internally; this call site additionally never propagates the error to
	// RunOnce's caller).
	if err := s.deps.Notifier.Notify(ctx, notification.Notification{
		Title:         title,
		Body:          body,
		Level:         level,
		Source:        "download",
		CorrelationID: runID,
		Timestamp:     s.deps.Clock(),
	}); err != nil {
		s.logf(logger.LevelWarn, runID, "", "download.notification_failed", nil,
			"download notification %q failed: %v", title, err)
	}
}

func (s *Service) logf(level, runID, animeID, eventType string, metadata map[string]any, format string, args ...any) {
	if s.deps.Logger == nil {
		return
	}
	s.deps.Logger.Logf("download", level, logger.Fields{
		CorrelationID: runID,
		EntityID:      animeID,
		EventType:     eventType,
		Metadata:      metadata,
	}, format, args...)
}
