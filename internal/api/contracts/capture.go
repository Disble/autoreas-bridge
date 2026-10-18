package contracts

// Note: this package cannot import internal/observability/requestcapture --
// requestcapture/sanitizer.go already imports contracts, so
// CaptureCorrelations/CaptureOperationRef below are a local, English mirror
// of requestcapture.Correlations/OperationRef (deliberate drift from
// design.md's `requestcapture.Correlations` field type; app_capture_detail.go maps
// the reader's type into this one at the binding boundary).

// CaptureRow is the row part of a capture detail: the fixed base projection fields
// every capture carries, regardless of the underlying schema version.
type CaptureRow struct {
	RequestID    string  `json:"requestId"`
	CapturedAtMS int64   `json:"capturedAtMs"`
	Kind         string  `json:"kind"`
	Route        string  `json:"route"`
	Transport    string  `json:"transport"`
	Outcome      string  `json:"outcome"`
	ErrorCode    string  `json:"errorCode,omitempty"`
	HTTPStatus   *int    `json:"httpStatus,omitempty"`
	DurationMS   *int64  `json:"durationMs,omitempty"`
	AnimeID      *string `json:"animeId,omitempty"`
}

// CaptureOperationRef mirrors requestcapture.OperationRef (see the package
// doc comment above for why this package cannot import requestcapture).
type CaptureOperationRef struct {
	AnimeID   string `json:"animeId"`
	Operation string `json:"operation"`
	Outcome   string `json:"outcome"`
}

// CaptureCorrelations mirrors requestcapture.Correlations (see the package
// doc comment above).
type CaptureCorrelations struct {
	ChangelogIDs  []int64               `json:"changelogIds,omitempty"`
	OperationRefs []CaptureOperationRef `json:"operationRefs"`
	ConflictIDs   []string              `json:"conflictIds,omitempty"`
	ActivityIDs   []int64               `json:"activityIds,omitempty"`
}

// CaptureDetail is one full transaction detail: the row fields plus the
// request/response payload, bodies, headers, correlations, and originating
// device identity.
type CaptureDetail struct {
	CaptureRow
	Payload           map[string]any      `json:"payload"`
	RequestBody       *string             `json:"requestBody,omitempty"`
	RequestBodyState  string              `json:"requestBodyState,omitempty"`
	ResponseBody      *string             `json:"responseBody,omitempty"`
	ResponseBodyState string              `json:"responseBodyState,omitempty"`
	RequestHeaders    map[string]string   `json:"requestHeaders,omitempty"`
	ResponseHeaders   map[string]string   `json:"responseHeaders,omitempty"`
	Correlations      CaptureCorrelations `json:"correlations"`
	DeviceID          string              `json:"deviceId"`
	DeviceName        string              `json:"deviceName"`
}

// DeviceSyncDiagnosticReport is one attributed device sync diagnostics
// report: the cycle_report kind's events inside the kind-discriminated
// device_telemetry_events store. That store is the only one that can
// attribute a report to a device -- a diagnostics capture in request_captures
// carries the report body but not the device, because the
// POST /api/sync/diagnostics body has no device_id and identity travels
// only in the Authorization header.
type DeviceSyncDiagnosticReport struct {
	DeviceID                  string  `json:"deviceId"`
	ReportedAtMS              int64   `json:"reportedAtMs"`
	CycleID                   string  `json:"cycleId"`
	Degraded                  *string `json:"degraded,omitempty"`
	TriggerSource             string  `json:"triggerSource"`
	AppState                  string  `json:"appState"`
	ConsecutiveUnclosedCycles int     `json:"consecutiveUnclosedCycles"`
	PendingOpsCount           int     `json:"pendingOpsCount"`
	Cursor                    int     `json:"cursor"`
	PreviousOutcome           *string `json:"previousOutcome,omitempty"`
	PreviousElapsedMS         *int64  `json:"previousElapsedMs,omitempty"`
	PreviousErrorFingerprint  *string `json:"previousErrorFingerprint,omitempty"`
}

// DeviceSyncDiagnosticsQuery is the in-process query DTO for
// ListDeviceSyncDiagnostics. An empty DeviceID applies no device predicate;
// a zero or negative Limit means the reader's package default.
type DeviceSyncDiagnosticsQuery struct {
	DeviceID string
	Limit    int
}

// DeviceSyncDiagnosticsResult is the ListDeviceSyncDiagnostics result
// envelope. Items is always a non-nil slice so the frontend can range over
// it without a nil check; Degraded marks a reader-unavailable or query-error
// outcome (never a panic). Degraded,
// PreviousOutcome, PreviousElapsedMS and PreviousErrorFingerprint stay
// pointers so an absent value is never rendered as zero.
type DeviceSyncDiagnosticsResult struct {
	Items    []DeviceSyncDiagnosticReport `json:"items"`
	Degraded bool                         `json:"degraded"`
}
