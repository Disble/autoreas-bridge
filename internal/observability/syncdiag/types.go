// Package syncdiag owns the cycle_report wire contract and the
// closed-vocabulary validation behind POST /api/sync/diagnostics: the endpoint
// that lets a mobile device durably report sync-cycle diagnostics instead of
// losing them on delivery failure. The envelope, the kind registry, the
// discriminated store and the reader live in
// internal/observability/telemetry, which registers this package's validator as
// the cycle_report kind; what stays here is that validator and the record shape
// the kind marshals. It is a sibling of internal/observability/eventlog, never
// an extension of it -- the two domains share no logic (disjoint record shape,
// disjoint columns, disjoint filter fields).
package syncdiag

const (
	// RetryAfterSecs is sent on a shed response: 2.5x the write budget, past
	// the contention window that caused the shed, and well below mobile's
	// 15-second foreground-service tick. The telemetry store owns that write
	// budget and a copy of this number for its own endpoint; this copy survives
	// because the thumbnail download path answers a saturated slot with the
	// same retry hint, and repointing that caller is a separate slice.
	RetryAfterSecs = 5
	// retentionLimit is the cycle_report kind's row cap. The telemetry store
	// enforces it at prune time, never by rewriting a stored row, so this
	// number can change without a migration.
	retentionLimit = 5000
)

// RetentionLimit returns the cycle_report kind's row cap: how many diagnostics
// rows the telemetry store keeps for this kind. It is declared here rather than
// as a literal in the store so the kind that asks for the cap, the store that
// enforces it, and the observability facts surface that reports it all read one
// number instead of three that drift.
func RetentionLimit() int {
	return retentionLimit
}

// PreviousCycle is the validated shape of the wire envelope's previous_cycle
// object. Every field is independently nullable except Outcome, which is
// required non-null whenever PreviousCycle itself is present. A nil
// *PreviousCycle on Record models the wire's explicit previous_cycle: null.
//
// The tags are the stored payload's own vocabulary, snake_case to match the
// wire vocabulary docs/openapi.yaml declares, and deliberately without
// omitempty: a nullable member keeps its key and serializes as explicit
// null, because an absent key and a null member are different facts.
type PreviousCycle struct {
	CycleID           *string `json:"cycle_id"`
	TriggerSource     *string `json:"trigger_source"`
	Outcome           string  `json:"outcome"`
	LastStage         *string `json:"last_stage"`
	StartedAt         *int64  `json:"started_at"`
	ElapsedMS         *int64  `json:"elapsed_ms"`
	ErrorName         *string `json:"error_name"`
	NativeErrcodeByte *int    `json:"native_errcode_byte"`
	ErrorStage        *string `json:"error_stage"`
	ErrorCause        *string `json:"error_cause"`
	ErrorFingerprint  *string `json:"error_fingerprint"`
}

// RecentEvent is one validated entry of the wire envelope's recent_events
// array. It is re-serialized server-side from these validated fields before
// persistence, never copied from the client's raw bytes.
type RecentEvent struct {
	Source  string `json:"source"`
	Event   string `json:"event"`
	Cause   string `json:"cause,omitempty"`
	FirstAt int64  `json:"first_at"`
	LastAt  int64  `json:"last_at"`
	Count   int    `json:"count"`
}

// Record is the validated, storage-ready shape of one diagnostics report.
//
// Its tags are the stored payload_json contract: snake_case, matching the
// vocabulary docs/openapi.yaml already declares on the wire. DeviceID,
// ReportedAtMS and Degraded are json:"-" because the envelope's own columns
// own them -- device identity comes from the authenticated token, receipt
// time from the receipt clock, and degraded has a column of its own. A copy
// inside the payload could only ever contradict the column that owns it.
//
// Nothing here is omitempty. recent_events must serialize as [] rather than
// vanish or become null, and a nil PreviousCycle must serialize as explicit
// null: the wire distinguishes an absent key from an explicit null, and this
// record's nil means explicit null.
type Record struct {
	DeviceID                  string        `json:"-"`
	ReportedAtMS              int64         `json:"-"`
	CycleID                   string        `json:"cycle_id"`
	Degraded                  *string       `json:"-"`
	TriggerSource             string        `json:"trigger_source"`
	AppState                  string        `json:"app_state"`
	ConsecutiveUnclosedCycles int           `json:"consecutive_unclosed_cycles"`
	PendingOpsCount           int           `json:"pending_ops_count"`
	Cursor                    int           `json:"cursor"`
	RecentEvents              []RecentEvent `json:"recent_events"`
	// PreviousCycle is nil for the wire's explicit previous_cycle: null.
	PreviousCycle *PreviousCycle `json:"previous_cycle"`
}
