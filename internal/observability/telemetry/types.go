package telemetry

import (
	"errors"
	"time"
)

const (
	// WriteBudget bounds Insert's database call, never the HTTP response. It
	// deliberately preempts SQLite's own busy_timeout (5000ms, see
	// internal/sync/sqlite_bootstrap.go) ON PURPOSE: telemetry is the
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
	// SYNC_CYCLE_TELEMETRY_MAX_BYTES cap (4096). It belongs to the transport
	// rather than to any kind, because every kind shares the one endpoint
	// and the one buffer.
	MaxBodyBytes = 8 << 10
	// pruneEvery is the successful-write cadence that triggers a prune pass
	// for the kind just written.
	pruneEvery = 100
)

// ErrWriteBudget is returned when Insert's database call does not complete
// within its configured write budget. It wraps context.DeadlineExceeded.
var ErrWriteBudget = errors.New("telemetry: write budget exceeded")

// ErrUndeclaredKind is returned when Insert is asked for a kind the store
// has no declared retention cap for, whether because it was configured with
// no registry at all or because the registry does not name that kind. The
// store refuses rather than storing it: a row nothing can ever prune is
// unbounded growth in the one table whose entire purpose is to be bounded,
// so a wiring bug must surface as a rejected write instead of a table that
// grows forever. The endpoint maps it to 500, not a retryable 503 -- no
// amount of retrying fixes a missing declaration.
var ErrUndeclaredKind = errors.New("telemetry: kind has no declared retention limit")

// IngestOutcome classifies the result of Insert.
type IngestOutcome int

const (
	// Stored means a new row was inserted.
	Stored IngestOutcome = iota
	// Duplicate means (kind, event_id) already existed; no row was inserted,
	// but the caller should still acknowledge success -- a blind retry stays
	// correct.
	Duplicate
	// Shed means the write did not complete and no row was inserted; the
	// caller must never treat this as success.
	Shed
)

// StoreConfig configures the store's write budget and the kind vocabulary it
// resolves retention from. The zero value uses WriteBudget and declares no
// kind, so Insert refuses every event rather than storing a kind whose cap
// the store was never told.
type StoreConfig struct {
	// WriteBudget bounds one database call. Non-positive means WriteBudget.
	WriteBudget time.Duration
	// Registry is the declared kind vocabulary, consulted by Insert to decide
	// whether the written kind may be stored at all and at prune time for its
	// own row cap. It is the registry rather than a limit map because a kind's
	// cap is one declaration, kept with the kind that owns it; nil declares no
	// kind, so every Insert is refused.
	Registry *Registry
}
