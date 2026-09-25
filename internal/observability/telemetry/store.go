package telemetry

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"
)

const insertEventSQL = `
	INSERT INTO device_telemetry_events (
		device_id, reported_at_ms, kind, event_id, observed_at_ms, degraded, payload_json
	) VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(kind, event_id) DO NOTHING`

// pruneKindSQL deletes the oldest rows past one kind's own cap. The kind
// predicate lives in the subquery alone: repeating it on the outer DELETE
// would be redundant, and redundancy here would let the isolation guard rot
// unnoticed because deleting another kind's rows would still look correct.
const pruneKindSQL = `
	DELETE FROM device_telemetry_events
	WHERE rowid IN (
		SELECT rowid FROM device_telemetry_events
		WHERE kind = ?
		ORDER BY reported_at_ms DESC
		LIMIT -1 OFFSET ?
	)`

// Event is one already-validated telemetry write: the envelope the transport
// owns plus the contribution the event's kind produced.
type Event struct {
	// DeviceID comes from the bearer token only, never from the body.
	DeviceID string
	// ReportedAtMS is the receipt clock, never a client-supplied timestamp.
	ReportedAtMS int64
	// Kind is the wire discriminator the event was dispatched as.
	Kind KindName
	// Validated is the kind's own contribution, produced only by a Kind.
	Validated Validated
}

// Store persists validated telemetry events into the kind-discriminated
// device_telemetry_events table.
type Store struct {
	db          *sql.DB
	writeBudget time.Duration
	registry    *Registry
	successful  int
}

// NewStore builds a SQLite-backed telemetry store.
func NewStore(db *sql.DB, config StoreConfig) *Store {
	budget := config.WriteBudget
	if budget <= 0 {
		budget = WriteBudget
	}
	return &Store{db: db, writeBudget: budget, registry: config.Registry}
}

// Insert stores one validated event. A duplicate (kind, event_id) is a no-op
// that still reports Duplicate, not an error -- this is what lets a caller
// retry blind and remain correct. The deadline bounds only this database
// call, never the caller's response: database/sql's connection-pool wait is
// context-aware, so a shed write gives up its place in the wait queue rather
// than landing its row after this call returns.
func (s *Store) Insert(ctx context.Context, event Event) (IngestOutcome, error) {
	if s.db == nil {
		return Shed, errors.New("telemetry: store unavailable")
	}
	// A kind with no declared cap is refused before any database work. Such a
	// row could never be pruned, and a store that accepts it turns a missing
	// declaration into an ever-growing table; Shed is the honest outcome
	// because no row was inserted, and returning it without touching the
	// database is what keeps the refusal free.
	if _, declared := s.retentionLimit(event.Kind); !declared {
		return Shed, fmt.Errorf("%w: %s", ErrUndeclaredKind, event.Kind)
	}

	writeCtx, cancel := context.WithTimeout(ctx, s.writeBudget)
	defer cancel()

	res, err := s.db.ExecContext(writeCtx, insertEventSQL,
		event.DeviceID, event.ReportedAtMS, event.Kind, event.Validated.EventID,
		event.Validated.ObservedAtMS, event.Validated.Degraded, string(event.Validated.Payload))
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return Shed, fmt.Errorf("%w: %w", ErrWriteBudget, err)
		}
		return Shed, err
	}

	inserted, _ := res.RowsAffected()
	if inserted != 1 {
		return Duplicate, nil
	}
	if pruneErr := s.pruneOldestBeyondRetention(ctx, event.Kind); pruneErr != nil {
		log.Printf("telemetry: prune failed: %v", pruneErr)
	}
	return Stored, nil
}

// pruneOldestBeyondRetention deletes the oldest rows past the written kind's
// own cap, called every pruneEvery successful writes so pruning cost scales
// with traffic rather than wall-clock time. The write counter is per-process
// and starts at zero, so cadence alone would never prune in a session that
// persists fewer than pruneEvery events -- the common case for a desktop app
// with short sessions. The first write of every process therefore prunes
// unconditionally, which bounds every kind that is actually growing. A
// conflict no-op never reaches this method, so it never advances the counter,
// and a refused undeclared kind never gets this far either.
func (s *Store) pruneOldestBeyondRetention(ctx context.Context, kind KindName) error {
	s.successful++
	if s.successful > 1 && s.successful%pruneEvery != 0 {
		return nil
	}
	limit, declared := s.retentionLimit(kind)
	if !declared {
		// Unreachable through Insert, which refuses an undeclared kind before
		// any database work. It stays because the alternative answer to an
		// undeclared kind -- deleting its rows against a borrowed cap -- is the
		// one outcome that would be worse than doing nothing, so a future
		// caller reaching this method another way still gets the safe answer.
		return nil
	}
	_, err := s.db.ExecContext(ctx, pruneKindSQL, kind, limit)
	return err
}

// retentionLimit resolves one kind's own row cap through the registry. An
// unregistered kind has no declared cap, and this single miss answer is what
// makes both the refusal in Insert and the no-op prune above decidable
// without a special case at each call site.
func (s *Store) retentionLimit(kind KindName) (int, bool) {
	if s.registry == nil {
		return 0, false
	}
	registered, ok := s.registry.Lookup(kind)
	if !ok {
		return 0, false
	}
	return registered.RetentionLimit(), true
}
