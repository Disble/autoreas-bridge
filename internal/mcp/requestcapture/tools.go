package requestcapture

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/observability/activityread"
	obs "autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/retention"
)

// clientRequestLimit caps the rows one client id returns. Each row carries
// its bodies; a client id repeats only when the phone retries a request.
const clientRequestLimit = 10

// tools answers each MCP tool from one reader and one clock.
type tools struct {
	reader *Reader
	now    func() time.Time
}

// status answers get_status from activityread Now. The sidecar is not the
// bridge process, so the bridge start is the newest stored startup marker.
func (t tools) status(ctx context.Context, _ StatusInput) (StatusResult, error) {
	now := t.now()
	started, err := t.bridgeStartedAt(ctx, now)
	if err != nil {
		return StatusResult{}, err
	}
	processStart := now
	if started != nil {
		processStart = time.UnixMilli(*started).In(now.Location())
	}
	year, month, day := now.Date()
	view, err := t.reader.activity.Now(ctx, activityread.NowInput{
		Now: now, LocalMidnight: time.Date(year, month, day, 0, 0, 0, 0, now.Location()), ProcessStartedAt: processStart,
	})
	if err != nil {
		return StatusResult{}, err
	}
	coverage, err := t.coverage(ctx, windowBefore(now, 24*time.Hour),
		sourceCaptures, sourceEvents, sourceRollup, sourceIncidents, sourceChanges)
	return StatusResult{Status: view, BridgeStartedAtMS: started, Coverage: coverage}, err
}

// bridgeStartedAt returns the time of the newest startup marker at or before
// now, or nil when none is stored. It walks the time index newest first.
func (t tools) bridgeStartedAt(ctx context.Context, now time.Time) (*int64, error) {
	var at int64
	err := t.reader.db().QueryRowContext(ctx, `SELECT occurred_at_ms FROM runtime_events
		WHERE occurred_at_ms <= ? AND event_type = 'tracer.step' AND message = ?
		ORDER BY occurred_at_ms DESC, id DESC LIMIT 1`, now.UnixMilli(), retention.StartupMarker).Scan(&at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("bridge start: %w", err)
	}
	return &at, nil
}

// incidents answers list_incidents.
func (t tools) incidents(ctx context.Context, in WhereInput) (IncidentsResult, error) {
	now := t.now()
	list, err := t.reader.activity.Incidents(ctx, activityread.IncidentsInput{Now: now, Where: activityread.Where(in.Where)})
	if err != nil {
		return IncidentsResult{}, err
	}
	coverage, err := t.coverage(ctx, windowBefore(now, activityread.IncidentListSpan), sourceIncidents)
	return IncidentsResult{Incidents: nonNil(list), Coverage: coverage}, err
}

// incident answers get_incident. A missing occurrence is not an error: the
// coverage says what the incidents table still holds.
func (t tools) incident(ctx context.Context, in IncidentInput) (IncidentResult, error) {
	if in.ID <= 0 {
		return IncidentResult{}, errors.New("id must be a positive incident id")
	}
	detail, err := t.reader.activity.IncidentDetail(ctx, in.ID)
	if errors.Is(err, activityread.ErrNotFound) {
		coverage, covErr := t.coverage(ctx, nil, sourceIncidents)
		return IncidentResult{Coverage: coverage}, covErr
	}
	if err != nil {
		return IncidentResult{}, err
	}
	window := newTimeRange(detail.Incident.WindowStartMS, detail.Incident.WindowEndMS)
	coverage, err := t.coverage(ctx, window, sourceIncidents, sourceCaptures, sourceEvents, sourceTelemetry)
	return IncidentResult{Found: true, Incident: detail, Coverage: coverage}, err
}

// request answers get_request by the capture row's primary key or by the
// phone's client id, which a retried request may share across several rows.
func (t tools) request(ctx context.Context, in RequestInput) (RequestResult, error) {
	requestID, clientID := strings.TrimSpace(in.RequestID), strings.TrimSpace(in.ClientRequestID)
	if requestID != "" && clientID != "" {
		return RequestResult{}, errors.New("give request_id or client_request_id, not both")
	}
	if requestID == "" && clientID == "" {
		return RequestResult{}, errors.New("request_id or client_request_id is required")
	}
	result := RequestResult{Requests: []obs.CaptureRecord{}}
	ids := []string{requestID}
	if clientID != "" {
		var err error
		if ids, result.Truncated, err = t.clientRequestIDs(ctx, clientID); err != nil {
			return RequestResult{}, err
		}
	}
	for _, id := range ids {
		row, err := t.reader.captures.Get(ctx, id)
		if err != nil {
			return RequestResult{}, err
		}
		result.MalformedRowsSkipped += row.MalformedRowsSkipped
		if !row.Found {
			continue
		}
		delete(row.Item.Payload, "authorization")
		delete(row.Item.Payload, "auth_token")
		result.Requests = append(result.Requests, row.Item)
	}
	result.Found = len(result.Requests) > 0
	coverage, err := t.fullCoverage(ctx, nil, sourceCaptures)
	result.Coverage = coverage
	return result, err
}

// clientRequestIDs returns the request ids sharing one client id, newest
// first, at most clientRequestLimit of them, through
// idx_request_captures_client_id. truncated is true when more exist.
func (t tools) clientRequestIDs(ctx context.Context, clientID string) (ids []string, truncated bool, err error) {
	rows, err := t.reader.db().QueryContext(ctx, `SELECT request_id FROM request_captures WHERE client_request_id = ?
		ORDER BY captured_at_ms DESC, request_id DESC LIMIT ?`, clientID, clientRequestLimit+1)
	if err != nil {
		return nil, false, fmt.Errorf("client request ids: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, false, fmt.Errorf("scan client request id: %w", err)
		}
		ids = append(ids, id)
	}
	if len(ids) > clientRequestLimit {
		ids, truncated = ids[:clientRequestLimit], true
	}
	return ids, truncated, rows.Err()
}

// history answers search_history. Unlike the desktop History, it lists the
// bridge's pushes: a diagnosis reads them, a human view would drown in them.
func (t tools) history(ctx context.Context, in HistoryInput) (HistoryResult, error) {
	now := t.now()
	where := activityread.Where(in.Where)
	view, err := t.reader.activity.History(ctx, activityread.HistoryInput{
		Now: now, Where: where, Cursor: in.Cursor, Limit: in.Limit, IncludeBroadcasts: true,
	})
	if err != nil {
		return HistoryResult{}, err
	}
	coverage, err := t.coverage(ctx, windowBefore(now, activityread.LedgerSpan), historySources(where)...)
	return HistoryResult{History: view, Coverage: coverage}, err
}

// historySources lists the tables History reads for one filter: the phone
// and All read every source; the editor adds desktop changes to the events
// and incidents every filter reads.
func historySources(where activityread.Where) []source {
	switch where {
	case activityread.WhereAll, activityread.WherePhone, "":
		return []source{sourceChanges, sourceTelemetry, sourceCaptures, sourceEvents, sourceIncidents}
	case activityread.WhereEditor:
		return []source{sourceChanges, sourceEvents, sourceIncidents}
	}
	return []source{sourceEvents, sourceIncidents}
}

// runs answers list_runs.
func (t tools) runs(ctx context.Context, in WhereInput) (RunsResult, error) {
	now := t.now()
	list, err := t.reader.activity.Runs(ctx, activityread.RunsInput{Now: now, Where: activityread.Where(in.Where)})
	if err != nil {
		return RunsResult{}, err
	}
	coverage, err := t.coverage(ctx, windowBefore(now, activityread.IncidentListSpan), sourceEvents)
	return RunsResult{Runs: nonNil(list), Coverage: coverage}, err
}

// runStory answers get_run_story.
func (t tools) runStory(ctx context.Context, in RunStoryInput) (RunStoryResult, error) {
	correlationID := strings.TrimSpace(in.CorrelationID)
	if correlationID == "" {
		return RunStoryResult{}, errors.New("correlation_id is required")
	}
	story, err := t.reader.activity.RunStory(ctx, correlationID)
	if err != nil {
		return RunStoryResult{}, err
	}
	story.Steps = nonNil(story.Steps)
	coverage, err := t.fullCoverage(ctx, nil, sourceEvents)
	return RunStoryResult{Story: story, Coverage: coverage}, err
}

// recorder answers list_recorder.
func (t tools) recorder(ctx context.Context, in RecorderInput) (RecorderResult, error) {
	now := t.now()
	page, err := t.reader.activity.Recorder(ctx, activityread.RecorderInput{Now: now, Cursor: in.Cursor, Limit: in.Limit})
	if err != nil {
		return RecorderResult{}, err
	}
	page.Entries = nonNil(page.Entries)
	coverage, err := t.fullCoverage(ctx, windowBefore(now, activityread.RecorderSpan), sourceCaptures, sourceEvents)
	return RecorderResult{Recorder: page, Coverage: coverage}, err
}

// responseVersions answers list_response_versions: the latest versions, or
// with at_ms the versions holding that time, whose coverage window is then
// that instant.
func (t tools) responseVersions(ctx context.Context, in ResponseVersionsInput) (ResponseVersionsResult, error) {
	route := strings.TrimSpace(in.RouteTemplate)
	if route == "" {
		return ResponseVersionsResult{}, errors.New("route_template is required")
	}
	template := obs.RouteTemplate(route)
	var versions []activityread.ResponseVersion
	var window *TimeRange
	var err error
	if in.AtMS != nil {
		versions, err = t.reader.activity.ResponseVersionsAt(ctx, template, *in.AtMS)
		window = newTimeRange(*in.AtMS, *in.AtMS)
	} else {
		versions, err = t.reader.activity.ResponseVersions(ctx, template)
	}
	if err != nil {
		return ResponseVersionsResult{}, err
	}
	coverage, err := t.coverage(ctx, window, sourceVersions)
	return ResponseVersionsResult{RouteTemplate: template, Versions: versions, Coverage: coverage}, err
}

// nonNil returns an empty slice for nil, so a list encodes as [] and not null.
func nonNil[T any](values []T) []T {
	if values == nil {
		return []T{}
	}
	return values
}
