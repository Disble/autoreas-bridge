package syncdiag

import (
	"errors"
	"time"
)

const (
	// WriteBudget bounds InsertReport's database call, never the HTTP
	// response. It deliberately preempts SQLite's own busy_timeout (5000ms,
	// see internal/sync/sqlite_bootstrap.go) ON PURPOSE: diagnostics is the
	// lowest-value traffic in the system and yields rather than competes.
	// Under SetMaxOpenConns(1) the dominant wait is the database/sql pool
	// wait anyway, so a shorter budget spends less time contending for the
	// single shared connection against work that matters more.
	WriteBudget = 2 * time.Second
	// RetryAfterSecs is sent on a shed response: 2.5x WriteBudget, past the
	// contention window that caused the shed, and well below mobile's
	// 15-second foreground-service tick.
	RetryAfterSecs = 5
	// MaxBodyBytes bounds the request body: 2x the mobile client's own
	// SYNC_CYCLE_TELEMETRY_MAX_BYTES cap (4096).
	MaxBodyBytes = 8 << 10
	// retentionLimit is the row cap enforced by pruning.
	retentionLimit = 5000
	// pruneEvery is the successful-write cadence that triggers a prune pass.
	pruneEvery = 100
)

// ErrWriteBudget is returned when InsertReport's database call does not
// complete within its configured write budget. It wraps
// context.DeadlineExceeded.
var ErrWriteBudget = errors.New("syncdiag: write budget exceeded")

// RetentionLimit returns the sync diagnostics store's retention limit: the
// row cap enforced by pruning (retentionLimit). It is exposed so a surface
// can state how much history the store keeps without copying the constant.
func RetentionLimit() int {
	return retentionLimit
}

// IngestOutcome classifies the result of InsertReport.
type IngestOutcome int

const (
	// Stored means a new row was inserted.
	Stored IngestOutcome = iota
	// Duplicate means cycle_id already existed; no row was inserted, but
	// the caller should still acknowledge success -- a blind retry stays
	// correct.
	Duplicate
	// Shed means the write did not complete, and no row was inserted; the
	// caller must never treat this as success.
	Shed
)

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

// StoreConfig configures the write budget used by InsertReport. The zero
// value uses WriteBudget.
type StoreConfig struct {
	WriteBudget time.Duration
}
