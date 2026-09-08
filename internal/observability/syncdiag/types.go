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
type PreviousCycle struct {
	CycleID           *string
	TriggerSource     *string
	Outcome           string
	LastStage         *string
	StartedAt         *int64
	ElapsedMS         *int64
	ErrorName         *string
	NativeErrcodeByte *int
	ErrorStage        *string
	ErrorCause        *string
	ErrorFingerprint  *string
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
type Record struct {
	DeviceID                  string
	ReportedAtMS              int64
	CycleID                   string
	Degraded                  *string
	TriggerSource             string
	AppState                  string
	ConsecutiveUnclosedCycles int
	PendingOpsCount           int
	Cursor                    int
	RecentEvents              []RecentEvent
	// PreviousCycle is nil for the wire's explicit previous_cycle: null.
	PreviousCycle *PreviousCycle
}

// StoreConfig configures the write budget used by InsertReport. The zero
// value uses WriteBudget.
type StoreConfig struct {
	WriteBudget time.Duration
}
