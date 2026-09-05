package download

import (
	"context"
	"time"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

// finalizeTimeout bounds the detached write that persists a stopped run's
// terminal row, so a hung store cannot keep a cancelled run alive.
const finalizeTimeout = 5 * time.Second

// finalizeContext returns a bounded context detached from the run's own
// cancellation, plus its release func. The terminal row is the one write that must
// land no matter how the run ended: writing it through a cancelled run context
// fails, leaving the row "running" until the next startup reconcile relabels it
// "interrupted" -- exactly the state a user-pressed Stop must never produce. It is
// detached unconditionally rather than only when cancelled, so the guarantee does
// not depend on a branch that ordinary runs never take.
func finalizeContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), finalizeTimeout)
}

// finalize stamps and persists a completed download run.
func (s *Service) finalize(ctx context.Context, run *Run) {
	finishedAt := s.deps.Clock().UnixMilli()
	run.FinishedAtMs = &finishedAt
	if s.deps.Store == nil {
		return
	}
	finalizeCtx, release := finalizeContext(ctx)
	defer release()
	if err := s.deps.Store.FinalizeRun(finalizeCtx, *run); err != nil {
		s.logf(logger.LevelError, run.RunID, "", events.EventNameDownloadFailed, nil,
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

// notifyWithOutcomes sends a user-facing notification about a run that touched named anime: it
// derives both the detail rows and their action tokens from the same outcomes.
//
// It takes outcomes rather than already-built rows because the two cannot be derived
// independently. A row's verb comes from what happened to that anime, and one of those verbs --
// the hoster links a blocked anime offers -- lives on the outcome and never reaches the row. An
// empty outcome slice produces a notification with no rows and its whole-notification tokens
// alone, which is exactly what a run that selected nothing should say.
func (s *Service) notifyWithOutcomes(ctx context.Context, n runNotification, outcomes []animeRunOutcome) {
	n.rows = buildRunDetailRows(outcomes)
	n.actions = buildOutcomeActions(n.kind, n.runID, outcomes)
	s.notify(ctx, n)
}

// runNotification is one user-facing download notification.
//
// A struct rather than a parameter list because the positional form put kind,
// runID, title and body beside each other as four adjacent strings (SonarQube
// go:S107 on the nine-parameter version). Swapping any two of them compiled,
// passed every test, and would have shipped a notification with the run id in
// its title.
type runNotification struct {
	level   notification.Level
	kind    string
	runID   string
	title   string
	body    string
	rows    []notification.DetailItem
	actions []notification.ActionSpec
}

// notifyWithRowsAndActions is the single Notifier call site: it sends one user-facing
// notification carrying explicit rows and explicit action tokens, without failing the download
// run.
//
// It exists for the producers whose rows do not come from run outcomes, and therefore cannot go
// through notifyWithOutcomes: run_started names anime the run has not processed yet, and
// readiness_attention names anime it is about to skip. Both describe a state rather than a
// result, so neither has an animeRunOutcome to read a verb from.
//
// kind is passed per call site rather than derived from the run status: run_started has no
// status at all, and deriving the rest would bury the mapping in a switch far from the title and
// body that were chosen alongside it.
func (s *Service) notify(ctx context.Context, n runNotification) {
	if s.deps.Notifier == nil {
		return
	}
	// Notifier failures must never fail the run (Notifier's own contract already requires
	// fan-out isolation internally; this call site additionally never propagates the error to
	// RunOnce's caller).
	if err := s.deps.Notifier.Notify(ctx, notification.Notification{
		Title:         n.title,
		Body:          n.body,
		Level:         n.level,
		Source:        "download",
		Kind:          n.kind,
		CorrelationID: n.runID,
		Timestamp:     s.deps.Clock(),
		Rows:          n.rows,
		Actions:       n.actions,
	}); err != nil {
		s.logf(logger.LevelWarn, n.runID, "", "download.notification_failed", nil,
			"download notification %q failed: %v", n.title, err)
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
