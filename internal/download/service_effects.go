package download

import (
	"context"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

// finalize stamps and persists a completed download run.
func (s *Service) finalize(ctx context.Context, run *Run) {
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

// recordProgress persists current run counters and publishes a progress event.
func (s *Service) recordProgress(ctx context.Context, run *Run) {
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

// notify sends a user-facing notification without failing the download run.
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

// logf writes a structured download log entry when logging is configured.
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
