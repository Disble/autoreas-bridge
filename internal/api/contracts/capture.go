package contracts

// Note: this package cannot import internal/observability/requestcapture --
// requestcapture/sanitizer.go already imports contracts, so
// CaptureCorrelations/CaptureOperationRef below are a local, English mirror
// of requestcapture.Correlations/OperationRef (deliberate drift from
// design.md's `requestcapture.Correlations` field type; app_captures.go maps
// the reader's type into this one at the binding boundary).

// CaptureQuery is the in-process query DTO for ListCaptureTransactions
// (design.md "Bound surface"): a page request plus the optional filters
// requestcapture.SearchFilters already supports. A zero value carries no
// filters and the reader's default page size.
type CaptureQuery struct {
	Limit      int
	Cursor     string
	Route      string
	Outcome    string
	Kind       string
	AnimeID    string
	ErrorCode  string
	HTTPStatus *int
	StartMS    *int64
	EndMS      *int64
}

// CaptureRow is one transaction-list row: the fixed base projection fields
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

// CapturePage is one ListCaptureTransactions page. Degraded is true when the
// reader is unavailable (nil bridgeDB) or the underlying query failed --
// Items is then an empty, never-nil slice so the frontend can range over it
// without a nil check.
type CapturePage struct {
	Items                []CaptureRow `json:"items"`
	NextCursor           string       `json:"nextCursor,omitempty"`
	AppliedLimit         int          `json:"appliedLimit"`
	MalformedRowsSkipped int          `json:"malformedRowsSkipped"`
	WarningCount         int          `json:"warningCount"`
	Degraded             bool         `json:"degraded"`
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

// CaptureDetail is one full transaction detail: the list row fields plus the
// request/response payload, bodies, headers, correlations, and originating
// device identity.
type CaptureDetail struct {
	CaptureRow
	Payload         map[string]any      `json:"payload"`
	ResponseBody    *string             `json:"responseBody,omitempty"`
	RequestHeaders  map[string]string   `json:"requestHeaders,omitempty"`
	ResponseHeaders map[string]string   `json:"responseHeaders,omitempty"`
	Correlations    CaptureCorrelations `json:"correlations"`
	DeviceID        string              `json:"deviceId"`
	DeviceName      string              `json:"deviceName"`
}

// CaptureDetailResult is the GetCaptureTransaction result envelope: Found
// distinguishes "no such request id" from a populated Item; Degraded marks a
// reader-unavailable or query-error outcome (never a panic).
type CaptureDetailResult struct {
	Found    bool          `json:"found"`
	Item     CaptureDetail `json:"item"`
	Degraded bool          `json:"degraded"`
}
