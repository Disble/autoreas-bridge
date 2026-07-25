package requestcapture

import "net/http"

const (
	defaultRetentionLimit = 5000
	defaultPruneEvery     = 100
	defaultSearchLimit    = 25
	maxSearchLimit        = 100
)

// CaptureFunc enqueues one sanitized observability record, reporting whether
// it was accepted. Shared by every capture site (HTTP middleware, WS pump
// decorator, realtime hub sink) so none of them need to depend on a concrete
// queue type -- only this narrow function shape.
type CaptureFunc func(record CaptureRecord) bool

// CaptureRecord is one sanitized captured request.
type CaptureRecord struct {
	RequestID       string
	CapturedAtMS    int64
	Kind            string
	Route           string
	Transport       string
	Device          DeviceIdentity
	Outcome         string
	AnimeID         *string
	HTTPStatus      *int
	Payload         map[string]any
	Correlations    Correlations
	ErrorCode       string
	ResponseBody    *string           `json:"response_body,omitempty"`
	RequestHeaders  map[string]string `json:"request_headers,omitempty"`
	ResponseHeaders map[string]string `json:"response_headers,omitempty"`
	DurationMS      *int64            `json:"duration_ms,omitempty"`
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

// Error is the structured request-capture failure envelope.
type Error struct {
	Code       string
	Message    string
	Retryable  bool
	HTTPStatus int
}

func (e Error) Error() string { return e.Message }

// unavailableError creates a retryable error for missing or unreachable resources.
func unavailableError(message string) Error {
	return Error{Code: "unavailable", Message: message, Retryable: true, HTTPStatus: http.StatusServiceUnavailable}
}

// schemaMismatchError creates a non-retryable error for schema/version mismatches.
func schemaMismatchError(message string) Error {
	return Error{Code: "schema_mismatch", Message: message, Retryable: false, HTTPStatus: http.StatusFailedDependency}
}

// invalidParamsError creates a non-retryable error for bad tool parameters.
func invalidParamsError(message string) Error {
	return Error{Code: "invalid_params", Message: message, Retryable: false, HTTPStatus: http.StatusBadRequest}
}

// unsupportedError creates a non-retryable error for unsupported tool requests.
func unsupportedError(message string) Error {
	return Error{Code: "unsupported", Message: message, Retryable: false, HTTPStatus: http.StatusMethodNotAllowed}
}

// QueueStopResult reports drain leftovers after Stop.
type QueueStopResult struct {
	UnfinishedItems int
}

// NewCaptureRecord creates a minimal capture record for tests and callers.
func NewCaptureRecord(kind string, deviceID string) CaptureRecord {
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

// ValidateToolName rejects any non-read-only tool name.
func ValidateToolName(name string) error {
	switch name {
	case "resolve_request_context", "search_requests", "get_request_context", "summary_requests":
		return nil
	default:
		return unsupportedError("unsupported request capture tool")
	}
}
