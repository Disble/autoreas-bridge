package activityread

import (
	"context"
	"database/sql"
	"fmt"
)

const (
	// SourceRequest marks a recorder entry read from request_captures.
	SourceRequest = "request"
	// SourceEvent marks a recorder entry read from runtime_events.
	SourceEvent = "event"
)

// Recorder source ranks: the tie-break order of entries sharing a millisecond.
const (
	rankRecorderEvent = iota + 1
	rankRecorderRequest
)

// Recorder returns one page of the 2-hour recorder, newest first: captures
// and events merged, summary fields only, never bodies.
func (r *Reader) Recorder(ctx context.Context, in RecorderInput) (RecorderPage, error) {
	c, err := parseCursor(in.Cursor)
	if err != nil {
		return RecorderPage{}, err
	}
	limit := clampLimit(in.Limit)
	nowMS := in.Now.UnixMilli()
	page := sourcePage{cursor: c, sinceMS: nowMS - RecorderSpan.Milliseconds(), nowMS: nowMS, fetch: limit + 1}
	requests, err := r.recorderRequests(ctx, page)
	if err != nil {
		return RecorderPage{}, err
	}
	events, err := r.recorderEvents(ctx, page)
	if err != nil {
		return RecorderPage{}, err
	}
	entries, next := takePage(append(requests, events...), limit)
	return RecorderPage{Entries: entries, NextCursor: next}, nil
}

// recorderRequests reads the capture summaries of one recorder page.
func (r *Reader) recorderRequests(ctx context.Context, p sourcePage) ([]item[RecorderEntry], error) {
	where, args, err := p.bounds(rankRecorderRequest, "captured_at_ms", "request_id", false)
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT request_id, captured_at_ms, kind, route, http_status, outcome,
		duration_ms, device_name, error_code FROM request_captures WHERE `+where+`
		ORDER BY captured_at_ms DESC, request_id DESC LIMIT ?`, append(args, p.fetch)...)
	if err != nil {
		return nil, fmt.Errorf("activityread: recorder requests: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var items []item[RecorderEntry]
	for rows.Next() {
		entry := RecorderEntry{Source: SourceRequest}
		var status, duration sql.NullInt64
		if err := rows.Scan(&entry.ID, &entry.AtMS, &entry.Kind, &entry.Route, &status, &entry.Outcome, &duration,
			&entry.DeviceName, &entry.ErrorCode); err != nil {
			return nil, fmt.Errorf("activityread: scan recorder request: %w", err)
		}
		entry.HTTPStatus, entry.DurationMS = nullableInt(status), nullableInt64(duration)
		items = append(items, item[RecorderEntry]{pos: cursor{atMS: entry.AtMS, rank: rankRecorderRequest, key: entry.ID}, value: entry})
	}
	return items, rows.Err()
}

// recorderEvents reads the event summaries of one recorder page.
func (r *Reader) recorderEvents(ctx context.Context, p sourcePage) ([]item[RecorderEntry], error) {
	where, args, err := p.bounds(rankRecorderEvent, "occurred_at_ms", "id", true)
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id, occurred_at_ms, domain, level, COALESCE(event_type, ''), message,
		COALESCE(correlation_id, ''), duration_ms FROM runtime_events WHERE `+where+`
		ORDER BY occurred_at_ms DESC, id DESC LIMIT ?`, append(args, p.fetch)...)
	if err != nil {
		return nil, fmt.Errorf("activityread: recorder events: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var items []item[RecorderEntry]
	for rows.Next() {
		entry := RecorderEntry{Source: SourceEvent}
		var id int64
		var duration sql.NullInt64
		if err := rows.Scan(&id, &entry.AtMS, &entry.Domain, &entry.Level, &entry.EventType, &entry.Message,
			&entry.CorrelationID, &duration); err != nil {
			return nil, fmt.Errorf("activityread: scan recorder event: %w", err)
		}
		entry.ID, entry.DurationMS = formatID(id), nullableInt64(duration)
		items = append(items, item[RecorderEntry]{pos: cursor{atMS: entry.AtMS, rank: rankRecorderEvent, key: intKey(id)}, value: entry})
	}
	return items, rows.Err()
}
