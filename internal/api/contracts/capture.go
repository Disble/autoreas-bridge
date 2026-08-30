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
	// DeviceID mirrors requestcapture.SearchFilters.DeviceID. Both it and
	// ChangelogID were already accepted by the reader and already translated
	// to SQL; only this DTO and its mapper lacked them, which is what kept the
	// two filters out of reach of the desktop app.
	DeviceID string
	// ChangelogID stays a pointer to match the reader exactly: 0 is a valid
	// changelog id, so a value type could not tell "no filter" from
	// "changelog 0".
	ChangelogID *int64
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

// CaptureDetailResult is the GetCaptureTransaction result envelope: Found
// distinguishes "no such request id" from a populated Item; Degraded marks a
// reader-unavailable or query-error outcome (never a panic).
type CaptureDetailResult struct {
	Found    bool          `json:"found"`
	Item     CaptureDetail `json:"item"`
	Degraded bool          `json:"degraded"`
}

// CaptureSummaryQuery is the in-process query DTO for
// SummarizeCaptureTransactions: the same optional filters CaptureQuery
// accepts, minus pagination -- an aggregation has no page. It mirrors the
// MCP's SummaryRequestsInput, which stands in the same relation to
// SearchRequestsInput.
type CaptureSummaryQuery struct {
	Route       string
	Outcome     string
	Kind        string
	AnimeID     string
	ErrorCode   string
	HTTPStatus  *int
	StartMS     *int64
	EndMS       *int64
	DeviceID    string
	ChangelogID *int64
}

// CaptureErrorSample is one bounded recent-error reference attached to a
// summary group, so a failing group can be opened without a second query.
type CaptureErrorSample struct {
	RequestID    string `json:"requestId"`
	CapturedAtMS int64  `json:"capturedAtMs"`
	ErrorCode    string `json:"errorCode"`
}

// CaptureSummaryGroup is one (route, http_status, outcome) aggregation bucket.
//
// HTTPStatus stays a pointer for the same reason the filters do, and it is
// load-bearing here: a websocket capture carries no HTTP status at all, and
// measured 2026-08-30 those were 40.8% of the stored table. A value type would
// report every one of them as status 0 -- a status the bridge never returned.
type CaptureSummaryGroup struct {
	Route              string               `json:"route"`
	HTTPStatus         *int                 `json:"httpStatus,omitempty"`
	Outcome            string               `json:"outcome"`
	Count              int                  `json:"count"`
	LatestErrorSamples []CaptureErrorSample `json:"latestErrorSamples"`
}

// CaptureSummary is one SummarizeCaptureTransactions result. Groups is a
// never-nil slice so an unmatched filter set is a zeroed aggregation rather
// than a null, and Degraded marks a reader-unavailable or query-error outcome
// (never a panic) exactly as CapturePage does.
type CaptureSummary struct {
	Groups   []CaptureSummaryGroup `json:"groups"`
	Degraded bool                  `json:"degraded"`
}
