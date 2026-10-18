package requestcapture

import (
	"autoreas-bridge/internal/observability/activityread"
	obs "autoreas-bridge/internal/observability/requestcapture"
)

// StatusInput takes no arguments.
type StatusInput struct{}

// WhereInput carries the "where it happened" filter: all (default), phone,
// downloads, editor, schedule or season.
type WhereInput struct {
	Where string `json:"where,omitempty" jsonschema:"all (default), phone, downloads, editor, schedule or season"`
}

// IncidentInput names one incident occurrence.
type IncidentInput struct {
	ID int64 `json:"id" jsonschema:"the incident occurrence id, as list_incidents returns it in LatestID"`
}

// RequestInput names one captured request.
type RequestInput struct {
	RequestID       string `json:"request_id,omitempty" jsonschema:"the bridge request id, the capture row key; give this or client_request_id"`
	ClientRequestID string `json:"client_request_id,omitempty" jsonschema:"the phone's X-Autoreas-Request-Id, <cycleId>:<n>; may match several rows"`
}

// HistoryInput selects one History page.
type HistoryInput struct {
	Where  string `json:"where,omitempty" jsonschema:"all (default), phone, downloads, editor, schedule or season"`
	Cursor string `json:"cursor,omitempty" jsonschema:"NextCursor of the previous page; empty for the first page"`
	Limit  int    `json:"limit,omitempty" jsonschema:"lines per page, default 50, at most 100"`
}

// RunStoryInput names one run.
type RunStoryInput struct {
	CorrelationID string `json:"correlation_id" jsonschema:"the run's correlation id, as list_runs returns it"`
}

// RecorderInput selects one recorder page.
type RecorderInput struct {
	Cursor string `json:"cursor,omitempty" jsonschema:"NextCursor of the previous page; empty for the first page"`
	Limit  int    `json:"limit,omitempty" jsonschema:"entries per page, default 50, at most 100"`
}

// ResponseVersionsInput names one route.
type ResponseVersionsInput struct {
	RouteTemplate string `json:"route_template" jsonschema:"a route template such as /api/animes/:id; a concrete route is reduced to its template"`
}

// StatusResult answers get_status. BridgeStartedAtMS is the newest stored
// startup marker; it is null when none is stored, and UptimeMS is then 0.
type StatusResult struct {
	Status            activityread.NowView `json:"status"`
	BridgeStartedAtMS *int64               `json:"bridge_started_at_ms"`
	Coverage          Coverage             `json:"coverage"`
}

// IncidentsResult answers list_incidents.
type IncidentsResult struct {
	Incidents []activityread.IncidentSummary `json:"incidents"`
	Coverage  Coverage                       `json:"coverage"`
}

// IncidentResult answers get_incident. Found is false when the occurrence
// is not stored; Coverage then says what the incidents table holds.
type IncidentResult struct {
	Found    bool                        `json:"found"`
	Incident activityread.IncidentDetail `json:"incident"`
	Coverage Coverage                    `json:"coverage"`
}

// RequestResult answers get_request with the stored rows and their bodies,
// newest first: at most one for a request id, up to clientRequestLimit for a
// client id. Truncated is true when more rows share the client id.
// MalformedRowsSkipped counts rows that matched but could not be decoded.
type RequestResult struct {
	Found                bool                `json:"found"`
	Requests             []obs.CaptureRecord `json:"requests"`
	Truncated            bool                `json:"truncated"`
	MalformedRowsSkipped int                 `json:"malformed_rows_skipped"`
	Coverage             Coverage            `json:"coverage"`
}

// HistoryResult answers search_history.
type HistoryResult struct {
	History  activityread.HistoryView `json:"history"`
	Coverage Coverage                 `json:"coverage"`
}

// RunsResult answers list_runs.
type RunsResult struct {
	Runs     []activityread.Run `json:"runs"`
	Coverage Coverage           `json:"coverage"`
}

// RunStoryResult answers get_run_story.
type RunStoryResult struct {
	Story    activityread.RunStory `json:"story"`
	Coverage Coverage              `json:"coverage"`
}

// RecorderResult answers list_recorder.
type RecorderResult struct {
	Recorder activityread.RecorderPage `json:"recorder"`
	Coverage Coverage                  `json:"coverage"`
}

// ResponseVersionsResult answers list_response_versions.
type ResponseVersionsResult struct {
	RouteTemplate string                         `json:"route_template"`
	Versions      []activityread.ResponseVersion `json:"versions"`
	Coverage      Coverage                       `json:"coverage"`
}
