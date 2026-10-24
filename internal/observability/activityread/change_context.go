package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
)

// ChangeContextWindow is how far around a change's time its runtime events and
// captures are looked for. No stored key links a history change to them:
// its correlation id (anime.patch:<anime>:<ms>) is written nowhere else, so the
// anime and the time are the only shared facts.
//
// Caveat: two changes of the same anime less than a window apart read each
// other's events and captures, because nothing tells them apart.
const ChangeContextWindow = time.Second

// ChangeContext is what one Activity change line links to: the runtime events
// stored for its anime around its time, capped like a run story, and the
// captured requests that carried it, folded like an incident window. Found is
// false when no change has that id.
type ChangeContext struct {
	Found     bool
	Events    []RunStep
	Truncated bool
	Requests  []FoldedRequest
}

// ChangeContext reads the change (the feed line's id and time) through
// internal/activity, the history's owner, then the events and captures of its
// anime around that time. The change is the newest row at or before its own
// (time, id) position, so the owner's ordered list finds it with one row. Both
// window queries walk their time index (idx_runtime_events_time,
// idx_request_captures_time) and filter by anime on the rows in range, so no
// anime index is needed.
func (r *Reader) ChangeContext(ctx context.Context, changeID, atMS int64) (ChangeContext, error) {
	records, err := r.changes.ListRecent(ctx, activity.ListQuery{
		Limit: 1, SinceMS: atMS, UntilMS: atMS, Before: &activity.Position{OccurredAtMs: atMS, ID: changeID + 1},
	})
	if err != nil {
		return ChangeContext{}, fmt.Errorf("activityread: change %d: %w", changeID, err)
	}
	if len(records) == 0 || records[0].ID != changeID {
		return ChangeContext{}, nil
	}
	animeID := records[0].AnimeID
	out := ChangeContext{Found: true}
	if animeID == "" {
		return out, nil
	}
	fromMS, toMS := atMS-ChangeContextWindow.Milliseconds(), atMS+ChangeContextWindow.Milliseconds()
	events, truncated, err := r.changeEvents(ctx, animeID, fromMS, toMS)
	if err != nil {
		return ChangeContext{}, err
	}
	requests, err := r.changeRequests(ctx, animeID, fromMS, toMS)
	if err != nil {
		return ChangeContext{}, err
	}
	out.Events, out.Truncated, out.Requests = events, truncated, foldRequests(requests, "")
	return out, nil
}

// changeEventsQuery reads the events of one entity inside a time range,
// oldest first, one row past the story cap.
const changeEventsQuery = `SELECT id, occurred_at_ms, domain, level, COALESCE(event_type, ''), message,
	COALESCE(correlation_id, ''), duration_ms, COALESCE(metadata_json, '') FROM runtime_events
	WHERE occurred_at_ms BETWEEN ? AND ? AND entity_id = ?
	ORDER BY occurred_at_ms, id LIMIT ?`

// changeEvents reads the anime's events inside the range, capped at StoryLimit.
func (r *Reader) changeEvents(ctx context.Context, animeID string, fromMS, toMS int64) ([]RunStep, bool, error) {
	rows, err := r.db.QueryContext(ctx, changeEventsQuery, fromMS, toMS, animeID, StoryLimit+1)
	if err != nil {
		return nil, false, fmt.Errorf("activityread: change events: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var steps []RunStep
	for rows.Next() {
		var step RunStep
		var duration sql.NullInt64
		if err := rows.Scan(&step.ID, &step.AtMS, &step.Domain, &step.Level, &step.EventType, &step.Message,
			&step.CorrelationID, &duration, &step.MetadataJSON); err != nil {
			return nil, false, fmt.Errorf("activityread: scan change event: %w", err)
		}
		step.DurationMS = nullableInt64(duration)
		steps = append(steps, step)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("activityread: change events: %w", err)
	}
	if len(steps) > StoryLimit {
		return steps[:StoryLimit], true, nil
	}
	return steps, false, nil
}

// changeRequestsQuery reads the captures inside a time range that name the
// anime, either as their own anime or in a reconcile operation reference,
// oldest first.
const changeRequestsQuery = `SELECT request_id, captured_at_ms, kind, route, outcome, http_status, duration_ms
	FROM request_captures WHERE captured_at_ms BETWEEN ? AND ?
	AND (anime_id = ? OR EXISTS (SELECT 1 FROM json_each(correlation_json, '$.operation_refs')
		WHERE json_extract(value, '$.anime_id') = ?))
	ORDER BY captured_at_ms, request_id LIMIT ?`

// changeRequests reads the anime's captures inside the range.
func (r *Reader) changeRequests(ctx context.Context, animeID string, fromMS, toMS int64) ([]windowRequest, error) {
	rows, err := r.db.QueryContext(ctx, changeRequestsQuery, fromMS, toMS, animeID, animeID, windowRowLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: change requests: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var requests []windowRequest
	for rows.Next() {
		var req windowRequest
		var status, duration sql.NullInt64
		if err := rows.Scan(&req.id, &req.atMS, &req.kind, &req.route, &req.outcome, &status, &duration); err != nil {
			return nil, fmt.Errorf("activityread: scan change request: %w", err)
		}
		req.status, req.durationMS = nullableInt(status), nullableInt64(duration)
		requests = append(requests, req)
	}
	return requests, rows.Err()
}
