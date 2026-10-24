package activityread

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"

	"autoreas-bridge/internal/observability/incident"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/telemetry"
)

// windowRequest is one capture inside an incident window, summary fields only.
type windowRequest struct {
	id, kind, route, outcome string
	atMS                     int64
	status                   *int
	durationMS               *int64
}

// foldKey groups window requests: same route template and same status. A
// missing status keys as 0, which no stored HTTP status uses.
type foldKey struct {
	template string
	status   int
}

// IncidentDetail returns one occurrence with its cause and its window.
func (r *Reader) IncidentDetail(ctx context.Context, id int64) (IncidentDetail, error) {
	var occ IncidentOccurrence
	err := r.db.QueryRowContext(ctx, `SELECT id, fingerprint, reason, occurred_at_ms, window_start_ms, window_end_ms,
		source_kind, source_id FROM incidents WHERE id = ?`, id).Scan(&occ.ID, &occ.Fingerprint, &occ.Reason,
		&occ.OccurredAtMS, &occ.WindowStartMS, &occ.WindowEndMS, &occ.SourceKind, &occ.SourceID)
	if errors.Is(err, sql.ErrNoRows) {
		return IncidentDetail{}, ErrNotFound
	}
	if err != nil {
		return IncidentDetail{}, fmt.Errorf("activityread: incident %d: %w", id, err)
	}
	occ.Title = titleFor(occ.Fingerprint, occ.Reason)
	detail := IncidentDetail{Incident: occ, ExpiresAtMS: occ.OccurredAtMS + LedgerSpan.Milliseconds()}

	if detail.Cause, err = r.causeOf(ctx, occ); err != nil {
		return IncidentDetail{}, err
	}
	requests, err := r.windowRequests(ctx, occ.WindowStartMS, occ.WindowEndMS)
	if err != nil {
		return IncidentDetail{}, err
	}
	trigger := ""
	if occ.SourceKind == string(incident.SourceRequest) {
		trigger = occ.SourceID
	}
	detail.Requests = foldRequests(requests, trigger)
	if detail.Events, err = r.windowEvents(ctx, occ.WindowStartMS, occ.WindowEndMS); err != nil {
		return IncidentDetail{}, err
	}
	if detail.PhoneReports, err = r.phoneReports(ctx, occ.WindowStartMS, occ.WindowEndMS); err != nil {
		return IncidentDetail{}, err
	}
	if detail.Earlier, err = r.earlierOccurrences(ctx, occ); err != nil {
		return IncidentDetail{}, err
	}
	return detail, nil
}

// causeOf reads the recorded cause of the triggering fact: the P1
// error_message of a request, the message of an event, or the cause a phone
// report carried. A source that is no longer stored leaves the cause unknown.
func (r *Reader) causeOf(ctx context.Context, occ IncidentOccurrence) (Cause, error) {
	var cause Cause
	var err error
	switch incident.SourceKind(occ.SourceKind) {
	case incident.SourceRequest:
		err = r.db.QueryRowContext(ctx, `SELECT error_code, error_message FROM request_captures WHERE request_id = ?`,
			occ.SourceID).Scan(&cause.ErrorCode, &cause.Message)
	case incident.SourceEvent:
		eventID, parseErr := strconv.ParseInt(occ.SourceID, 10, 64)
		if parseErr != nil {
			return Cause{}, nil
		}
		err = r.db.QueryRowContext(ctx, `SELECT message FROM runtime_events WHERE id = ?`, eventID).Scan(&cause.Message)
	case incident.SourceMobile:
		err = r.db.QueryRowContext(ctx, `SELECT COALESCE(json_extract(payload_json, '$.cause'),
			json_extract(payload_json, '$.previous_cycle.error_cause'), '') FROM device_telemetry_events
			WHERE kind IN (?, ?, ?) AND event_id = ? LIMIT 1`, telemetry.KindCycleReport, telemetry.KindEpisodeAction, telemetry.KindScreenStall,
			occ.SourceID).Scan(&cause.Message)
	default:
		return Cause{}, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return Cause{}, nil
	}
	if err != nil {
		return Cause{}, fmt.Errorf("activityread: incident cause: %w", err)
	}
	cause.Known = cause.Message != "" || cause.ErrorCode != ""
	return cause, nil
}

// windowRequests reads the captures inside a window, oldest first.
func (r *Reader) windowRequests(ctx context.Context, fromMS, toMS int64) ([]windowRequest, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT request_id, captured_at_ms, kind, route, outcome, http_status, duration_ms
		FROM request_captures WHERE captured_at_ms >= ? AND captured_at_ms <= ?
		ORDER BY captured_at_ms, request_id LIMIT ?`, fromMS, toMS, windowRowLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: window requests: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var requests []windowRequest
	for rows.Next() {
		var req windowRequest
		var status, duration sql.NullInt64
		if err := rows.Scan(&req.id, &req.atMS, &req.kind, &req.route, &req.outcome, &status, &duration); err != nil {
			return nil, fmt.Errorf("activityread: scan window request: %w", err)
		}
		req.status, req.durationMS = nullableInt(status), nullableInt64(duration)
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

// foldRequests folds requests sharing a route template and a status into one
// row with a count, in order of first appearance. The row holding the
// triggering request is flagged.
func foldRequests(requests []windowRequest, triggerID string) []FoldedRequest {
	var folded []FoldedRequest
	index := map[foldKey]int{}
	for _, req := range requests {
		key := foldKey{template: requestcapture.RouteTemplate(req.route)}
		if req.status != nil {
			key.status = *req.status
		}
		position, seen := index[key]
		if !seen {
			position = len(folded)
			index[key] = position
			folded = append(folded, FoldedRequest{RouteTemplate: key.template, HTTPStatus: req.status, FirstAtMS: req.atMS})
		}
		row := &folded[position]
		row.Count++
		row.LastAtMS, row.LatestRequestID, row.Kind, row.Outcome = req.atMS, req.id, req.kind, req.outcome
		if req.durationMS != nil && (row.MaxDurationMS == nil || *req.durationMS > *row.MaxDurationMS) {
			value := *req.durationMS
			row.MaxDurationMS = &value
		}
		row.ContainsTrigger = row.ContainsTrigger || (triggerID != "" && req.id == triggerID)
	}
	return folded
}

// windowEvents reads the non-noise runtime events inside a window, oldest first.
func (r *Reader) windowEvents(ctx context.Context, fromMS, toMS int64) ([]EventSummary, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, occurred_at_ms, domain, level, COALESCE(event_type, ''), message,
		COALESCE(correlation_id, ''), COALESCE(entity_id, '') FROM runtime_events
		WHERE occurred_at_ms >= ? AND occurred_at_ms <= ? AND `+noiseFilter+`
		ORDER BY occurred_at_ms, id LIMIT ?`, fromMS, toMS, windowRowLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: window events: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var events []EventSummary
	for rows.Next() {
		var e EventSummary
		if err := rows.Scan(&e.ID, &e.AtMS, &e.Domain, &e.Level, &e.EventType, &e.Message, &e.CorrelationID, &e.EntityID); err != nil {
			return nil, fmt.Errorf("activityread: scan window event: %w", err)
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// phoneReports reads the mobile reports the bridge received inside a window,
// oldest first.
func (r *Reader) phoneReports(ctx context.Context, fromMS, toMS int64) ([]PhoneReport, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT rowid, reported_at_ms, observed_at_ms, device_id, kind, `+reportOutcomeSQL+`
		FROM device_telemetry_events WHERE kind IN (?, ?, ?) AND reported_at_ms >= ? AND reported_at_ms <= ?
		ORDER BY reported_at_ms, rowid LIMIT ?`, telemetry.KindCycleReport, telemetry.KindEpisodeAction, telemetry.KindScreenStall,
		fromMS, toMS, windowRowLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: window phone reports: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var reports []PhoneReport
	for rows.Next() {
		var report PhoneReport
		var observed sql.NullInt64
		if err := rows.Scan(&report.ID, &report.AtMS, &observed, &report.DeviceID, &report.Kind, &report.Outcome); err != nil {
			return nil, fmt.Errorf("activityread: scan phone report: %w", err)
		}
		report.PhoneAtMS = nullableInt64(observed)
		reports = append(reports, report)
	}
	return reports, rows.Err()
}

// reportOutcomeSQL extracts a phone report's outcome: an episode action
// carries it at the top level, a cycle report under previous_cycle. A screen
// stall carries no outcome, so its trigger and duration ("touch 12000 ms")
// stand in, which is what makes a freeze findable by time in History.
const reportOutcomeSQL = `COALESCE(json_extract(payload_json, '$.outcome'),
	json_extract(payload_json, '$.previous_cycle.outcome'),
	json_extract(payload_json, '$.trigger') || ' ' || json_extract(payload_json, '$.duration_ms') || ' ms', '')`

// earlierOccurrences lists the retained occurrences of a fingerprint before
// the given one, newest first.
func (r *Reader) earlierOccurrences(ctx context.Context, occ IncidentOccurrence) ([]EarlierOccurrence, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, occurred_at_ms FROM incidents WHERE fingerprint = ?
		AND (occurred_at_ms < ? OR (occurred_at_ms = ? AND id < ?))
		ORDER BY occurred_at_ms DESC, id DESC LIMIT ?`, occ.Fingerprint, occ.OccurredAtMS, occ.OccurredAtMS, occ.ID, earlierLimit)
	if err != nil {
		return nil, fmt.Errorf("activityread: earlier occurrences: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var earlier []EarlierOccurrence
	for rows.Next() {
		var e EarlierOccurrence
		if err := rows.Scan(&e.ID, &e.OccurredAtMS); err != nil {
			return nil, fmt.Errorf("activityread: scan earlier occurrence: %w", err)
		}
		earlier = append(earlier, e)
	}
	return earlier, rows.Err()
}
