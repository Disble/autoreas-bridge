package requestcapture

import "autoreas-bridge/internal/observability/obserr"

const (
	defaultRetentionLimit = 5000
	defaultPruneEvery     = 100
	defaultSearchLimit    = 25
	maxSearchLimit        = 100
	// MaxCapturedBodyBytes bounds any single captured request/response body so
	// heap, queue, and SQLite growth stay finite under abuse while ordinary JSON
	// traffic below this budget still preserves every byte exactly.
	MaxCapturedBodyBytes = 64 * 1024
	// CaptureStateTruncated marks a body stored only up to MaxCapturedBodyBytes.
	CaptureStateTruncated = "truncated"
	// CaptureStateOmittedTooLarge marks a request body skipped pre-auth because
	// its declared size exceeded MaxCapturedBodyBytes.
	CaptureStateOmittedTooLarge = "omitted_too_large"
	// CaptureStateOmittedStreaming marks a request body skipped pre-auth because
	// its size was not declared, so reading it before auth would stream
	// unboundedly.
	CaptureStateOmittedStreaming = "omitted_streaming"
	// OutcomePending is the transport-only arrival outcome written before a
	// handler runs, replaced by the terminal write that follows it.
	OutcomePending = "pending"
	// OutcomeAbandoned is the terminal outcome for an arrival row whose
	// terminal write never landed -- the process died between the two writes.
	// It deliberately carries no http_status and no duration_ms: the bridge
	// never observed either, and inventing them would make the row claim a
	// wire fact that never happened.
	OutcomeAbandoned = "abandoned"
)

// CaptureFunc enqueues one sanitized observability record, reporting whether
// it was accepted. Shared by every capture site (HTTP middleware, WS pump
// decorator, realtime hub sink) so none of them need to depend on a concrete
// queue type -- only this narrow function shape.
type CaptureFunc func(record CaptureRecord) bool

// CaptureRecord is one sanitized captured request.
type CaptureRecord struct {
	RequestID         string
	CapturedAtMS      int64
	Kind              string
	Route             string
	Transport         string
	Device            DeviceIdentity
	Outcome           string
	AnimeID           *string
	HTTPStatus        *int
	Payload           map[string]any
	Correlations      Correlations
	ErrorCode         string
	RequestBody       *string           `json:"request_body,omitempty"`
	RequestBodyState  string            `json:"request_body_state,omitempty"`
	ResponseBody      *string           `json:"response_body,omitempty"`
	ResponseBodyState string            `json:"response_body_state,omitempty"`
	RequestHeaders    map[string]string `json:"request_headers,omitempty"`
	ResponseHeaders   map[string]string `json:"response_headers,omitempty"`
	DurationMS        *int64            `json:"duration_ms,omitempty"`
}

// DeviceIdentity is the trusted authenticated device projection.
type DeviceIdentity struct {
	DeviceID string `json:"device_id"`
	Name     string `json:"name"`
}

// Correlations carries auxiliary effect references.
type Correlations struct {
	ChangelogIDs  []int64        `json:"changelog_ids,omitempty"`
	OperationRefs []OperationRef `json:"operation_refs"`
	ConflictIDs   []string       `json:"conflict_ids,omitempty"`
	ActivityIDs   []int64        `json:"activity_ids,omitempty"`
}

// OperationRef is one reconcile operation result reference.
type OperationRef struct {
	AnimeID   string `json:"anime_id"`
	Operation string `json:"operation"`
	Outcome   string `json:"outcome"`
}

// SearchParams defines search pagination plus optional server-side filters.
type SearchParams struct {
	Limit   int
	Cursor  string
	Filters SearchFilters
}

// SummaryResult aggregates captures into per-group counts and bounded error samples.
type SummaryResult struct {
	Groups []SummaryGroup `json:"groups"`
}

// SummaryGroup is one (route, http_status, outcome) aggregation bucket.
type SummaryGroup struct {
	Route              string        `json:"route"`
	HTTPStatus         *int          `json:"http_status"`
	Outcome            string        `json:"outcome"`
	Count              int           `json:"count"`
	LatestErrorSamples []ErrorSample `json:"latest_error_samples"`
}

// ErrorSample is one bounded recent-error reference for a summary group.
type ErrorSample struct {
	RequestID    string `json:"request_id"`
	CapturedAtMS int64  `json:"captured_at_ms"`
	ErrorCode    string `json:"error_code"`
}

// SearchPage is one newest-first results page.
type SearchPage struct {
	Items                []CaptureRecord `json:"items"`
	AppliedLimit         int             `json:"applied_limit"`
	NextCursor           string          `json:"next_cursor,omitempty"`
	MalformedRowsSkipped int             `json:"malformed_rows_skipped"`
	WarningCount         int             `json:"warning_count"`
}

// GetResult is the exact-get result envelope.
type GetResult struct {
	Found                bool
	Item                 CaptureRecord
	MalformedRowsSkipped int
	WarningCount         int
}

// Error is the structured request-capture failure envelope, aliased from the
// shared obserr package so every observability tool (capture and runtime
// event) emits the same error schema.
type Error = obserr.Error

// unavailableError creates a retryable error for missing or unreachable resources.
func unavailableError(message string) Error {
	return obserr.Unavailable(message)
}

// schemaMismatchError creates a non-retryable error for schema/version mismatches.
func schemaMismatchError(message string) Error {
	return obserr.SchemaMismatch(message)
}

// invalidParamsError creates a non-retryable error for bad tool parameters.
func invalidParamsError(message string) Error {
	return obserr.InvalidParams(message)
}

// unsupportedError creates a non-retryable error for unsupported tool requests.
func unsupportedError(message string) Error {
	return obserr.Unsupported(message)
}

// QueueStopResult reports drain leftovers after Stop.
type QueueStopResult struct {
	UnfinishedItems int
}

// NewCaptureRecord creates a minimal capture record for tests and callers.
func NewCaptureRecord(kind, deviceID string) CaptureRecord {
	return CaptureRecord{
		Kind:      kind,
		Route:     "/api/animes/test",
		Transport: "http",
		Outcome:   "accepted",
		Device: DeviceIdentity{
			DeviceID: deviceID,
			Name:     "Phone",
		},
		Payload:      map[string]any{},
		Correlations: Correlations{OperationRefs: []OperationRef{}},
	}
}

// Normalize ensures all nullable slices and maps are non-nil so JSON output
// schemas never receive null where an object or array is required.
func (r *CaptureRecord) Normalize() {
	if r.Payload == nil {
		r.Payload = map[string]any{}
	}
	r.Correlations.Normalize()
}

// Normalize ensures correlation slices are non-nil so JSON marshaling emits
// empty arrays instead of null.
func (c *Correlations) Normalize() {
	if c.ChangelogIDs == nil {
		c.ChangelogIDs = []int64{}
	}
	if c.OperationRefs == nil {
		c.OperationRefs = []OperationRef{}
	}
	if c.ConflictIDs == nil {
		c.ConflictIDs = []string{}
	}
	if c.ActivityIDs == nil {
		c.ActivityIDs = []int64{}
	}
}

// ValidateToolName rejects any non-read-only tool name. It gates the
// sidecar's whole tool surface: the four request-capture tools plus the
// three runtime-event tools added by the MCP runtime-event read change. No
// alias name is accepted for any tool.
func ValidateToolName(name string) error {
	switch name {
	case "resolve_request_context", "search_requests", "get_request_context", "summary_requests",
		"search_events", "get_correlation_timeline", "summary_events":
		return nil
	default:
		return unsupportedError("unsupported request capture tool")
	}
}
