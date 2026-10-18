package activityread

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/logger"
)

// Runs returns the runtime events of the filter's domains grouped by
// non-empty correlation id over the last 7 days, newest run first.
func (r *Reader) Runs(ctx context.Context, in RunsInput) ([]Run, error) {
	s, err := scopeOf(in.Where)
	if err != nil {
		return nil, err
	}
	filter, filterArgs := s.eventFilter()
	nowMS := in.Now.UnixMilli()
	query := `WITH runs AS (
			SELECT correlation_id, MIN(occurred_at_ms) AS first_ms, MAX(occurred_at_ms) AS last_ms, COUNT(*) AS steps,
				MAX(` + levelRankSQL + `) AS worst
			FROM runtime_events
			WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND correlation_id IS NOT NULL AND correlation_id <> ''
				AND ` + filter + ` AND level IN (?, ?, ?, ?)
			GROUP BY correlation_id ORDER BY last_ms DESC LIMIT ?
		)
		SELECT runs.correlation_id, first_ms, last_ms, steps,
			CASE worst WHEN 3 THEN 'error' WHEN 2 THEN 'warn' WHEN 1 THEN 'info' ELSE 'debug' END,
			COALESCE(first.event_type, ''), COALESCE(first.message, '')
		FROM runs LEFT JOIN runtime_events AS first ON first.id = (
			SELECT id FROM runtime_events WHERE correlation_id = runs.correlation_id
			ORDER BY occurred_at_ms, id LIMIT 1)
		ORDER BY last_ms DESC, runs.correlation_id DESC`
	// The level list names every logger level. It changes no result; it lets
	// idx_runtime_events_domain_level bound the domain read by time on a
	// database without ANALYZE statistics.
	args := append([]any{nowMS - IncidentListSpan.Milliseconds(), nowMS}, filterArgs...)
	args = append(args, logger.LevelDebug, logger.LevelInfo, logger.LevelWarn, logger.LevelError)
	rows, err := r.db.QueryContext(ctx, query, append(args, RunListLimit)...)
	if err != nil {
		return nil, fmt.Errorf("activityread: runs: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var runs []Run
	for rows.Next() {
		var run Run
		if err := rows.Scan(&run.CorrelationID, &run.FirstAtMS, &run.LastAtMS, &run.Steps, &run.Outcome,
			&run.FirstEventType, &run.FirstMessage); err != nil {
			return nil, fmt.Errorf("activityread: scan run: %w", err)
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

// RunStory returns the events of one correlation id in order, with their
// metadata, capped at StoryLimit steps.
func (r *Reader) RunStory(ctx context.Context, correlationID string) (RunStory, error) {
	story := RunStory{CorrelationID: correlationID}
	if correlationID == "" {
		return story, nil
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id, occurred_at_ms, domain, level, COALESCE(event_type, ''), message,
		duration_ms, COALESCE(metadata_json, '') FROM runtime_events WHERE correlation_id = ?
		ORDER BY occurred_at_ms, id LIMIT ?`, correlationID, StoryLimit+1)
	if err != nil {
		return RunStory{}, fmt.Errorf("activityread: run story: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		step := RunStep{EventSummary: EventSummary{CorrelationID: correlationID}}
		var duration sql.NullInt64
		if err := rows.Scan(&step.ID, &step.AtMS, &step.Domain, &step.Level, &step.EventType, &step.Message,
			&duration, &step.MetadataJSON); err != nil {
			return RunStory{}, fmt.Errorf("activityread: scan run step: %w", err)
		}
		step.DurationMS = nullableInt64(duration)
		story.Steps = append(story.Steps, step)
	}
	if len(story.Steps) > StoryLimit {
		story.Steps, story.Truncated = story.Steps[:StoryLimit], true
	}
	return story, rows.Err()
}
