package activityread

import (
	"context"
	"fmt"
	"regexp"
	"time"
)

var (
	// eventTypeShape is the logger's EventType vocabulary rule, domain.verb
	// (internal/logger/event_type_test.go).
	eventTypeShape = regexp.MustCompile(`^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$`)
	// metadataKeyShape is a top-level metadata key: a letter, then letters,
	// digits or underscores. It keeps the JSON path a plain member access.
	metadataKeyShape = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*$`)
)

// EventCountInput selects the runtime events counted: one EventType inside
// [From, To), optionally grouped by one top-level metadata key.
type EventCountInput struct {
	EventType string
	GroupBy   string
	From, To  time.Time
}

// EventCount is the number of counted events whose GroupBy key holds Value.
// Value is nil for the events without that key: the key is absent, holds
// JSON null, or the metadata was stored truncated or is not JSON.
type EventCount struct {
	Value *string
	Count int64
}

// EventCounts answers CountEvents. Groups is empty without a GroupBy; with
// one, the groups add up to Total and are ordered by count, largest first,
// then by value, the nil group last.
type EventCounts struct {
	Total  int64
	Groups []EventCount
}

// CountEvents counts the runtime events of one event type in a time range,
// read through the time index. The metadata key is validated and bound as a
// JSON path parameter, never interpolated into the SQL. A value is grouped as
// SQLite's json_extract reads it, so a number and its string spelling share a
// group.
func (r *Reader) CountEvents(ctx context.Context, in EventCountInput) (EventCounts, error) {
	if !eventTypeShape.MatchString(in.EventType) {
		return EventCounts{}, fmt.Errorf("activityread: event type %q is not shaped domain.verb", in.EventType)
	}
	if in.GroupBy != "" && !metadataKeyShape.MatchString(in.GroupBy) {
		return EventCounts{}, fmt.Errorf("activityread: group_by %q is not a metadata key (a letter, then letters, digits or _)", in.GroupBy)
	}
	if !in.From.Before(in.To) {
		return EventCounts{}, fmt.Errorf("activityread: count range %s..%s is empty", in.From, in.To)
	}
	counts := EventCounts{Groups: []EventCount{}}
	if in.GroupBy == "" {
		err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM runtime_events
			WHERE occurred_at_ms >= ? AND occurred_at_ms < ? AND event_type = ?`,
			in.From.UnixMilli(), in.To.UnixMilli(), in.EventType).Scan(&counts.Total)
		if err != nil {
			return EventCounts{}, fmt.Errorf("activityread: count events: %w", err)
		}
		return counts, nil
	}
	rows, err := r.db.QueryContext(ctx, `SELECT
		CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json, ?) END AS value, COUNT(*)
		FROM runtime_events WHERE occurred_at_ms >= ? AND occurred_at_ms < ? AND event_type = ?
		GROUP BY value ORDER BY COUNT(*) DESC, value IS NULL, value`,
		"$."+in.GroupBy, in.From.UnixMilli(), in.To.UnixMilli(), in.EventType)
	if err != nil {
		return EventCounts{}, fmt.Errorf("activityread: count events by %s: %w", in.GroupBy, err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var group EventCount
		if err := rows.Scan(&group.Value, &group.Count); err != nil {
			return EventCounts{}, fmt.Errorf("activityread: scan event count: %w", err)
		}
		counts.Groups = append(counts.Groups, group)
		counts.Total += group.Count
	}
	return counts, rows.Err()
}
