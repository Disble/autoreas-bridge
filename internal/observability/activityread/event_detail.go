package activityread

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// EventDetail is one runtime event with its raw metadata JSON, read by id
// for the Activity drawer. Found is false when no event has that id.
type EventDetail struct {
	Found bool
	Step  RunStep
}

// Event returns the runtime event with the given id and its metadata.
func (r *Reader) Event(ctx context.Context, id int64) (EventDetail, error) {
	var detail EventDetail
	step := &detail.Step
	var duration sql.NullInt64
	err := r.db.QueryRowContext(ctx, `SELECT id, occurred_at_ms, domain, level, COALESCE(event_type, ''), message,
		COALESCE(correlation_id, ''), duration_ms, COALESCE(metadata_json, '') FROM runtime_events WHERE id = ?`, id).
		Scan(&step.ID, &step.AtMS, &step.Domain, &step.Level, &step.EventType, &step.Message, &step.CorrelationID,
			&duration, &step.MetadataJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return EventDetail{}, nil
	}
	if err != nil {
		return EventDetail{}, fmt.Errorf("activityread: event: %w", err)
	}
	step.DurationMS = nullableInt64(duration)
	detail.Found = true
	return detail, nil
}
