package eventlog

import (
	"context"
	"database/sql"

	"autoreas-bridge/internal/observability/obserr"
)

// SQLiteStore persists events into bridge SQLite's runtime_events table.
type SQLiteStore struct {
	db         *sql.DB
	rowCap     int
	pruneEvery int
	successful int
}

// NewStore builds a SQLite-backed event store.
func NewStore(db *sql.DB, config EventStoreConfig) *SQLiteStore {
	rowCap := config.RowCap
	if rowCap <= 0 {
		rowCap = defaultRowCap
	}
	pruneEvery := config.PruneEvery
	if pruneEvery <= 0 {
		pruneEvery = defaultPruneEvery
	}
	return &SQLiteStore{db: db, rowCap: rowCap, pruneEvery: pruneEvery}
}

// nullableString returns nil for an empty string so the column binds as SQL
// NULL rather than an empty string.
func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// nullableDuration returns nil for a zero duration so the column binds as
// SQL NULL rather than a misleading 0 (logger.LogEntry uses 0 to mean
// "unset").
func nullableDuration(durationMS int64) *int64 {
	if durationMS == 0 {
		return nil
	}
	return &durationMS
}

// pruneOldestBeyondRetention deletes the oldest event rows past the
// configured row cap, called every pruneEvery successful write so pruning
// cost scales with event traffic instead of wall-clock time.
//
// The write counter is per-process and starts at zero, so cadence alone
// would never prune in a session that persists fewer than pruneEvery events
// -- the common case for a desktop app with short sessions, which would let
// the table grow past its cap across restarts and stay there. The first
// write of every process therefore prunes unconditionally, which bounds the
// table at startup regardless of how short the preceding sessions were.
func (s *SQLiteStore) pruneOldestBeyondRetention(ctx context.Context, tx *sql.Tx) error {
	s.successful++
	if s.successful > 1 && s.successful%s.pruneEvery != 0 {
		return nil
	}
	_, err := tx.ExecContext(ctx, `
		DELETE FROM runtime_events
		WHERE id IN (
			SELECT id FROM runtime_events
			ORDER BY occurred_at_ms DESC, id DESC
			LIMIT -1 OFFSET ?
		)
	`, s.rowCap)
	return err
}

// InsertEvent stores one event record: marshal + redact + bound metadata via
// metadata.go before bind, then BEGIN/INSERT/prune-every-N/COMMIT.
func (s *SQLiteStore) InsertEvent(ctx context.Context, record EventRecord) (err error) {
	if s.db == nil {
		return obserr.Unavailable("event store unavailable")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO runtime_events (
			occurred_at_ms, domain, level, message,
			correlation_id, entity_id, event_type, duration_ms, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, record.OccurredAtMS, record.Domain, record.Level, record.Message,
		nullableString(record.CorrelationID), nullableString(record.EntityID), nullableString(record.EventType),
		nullableDuration(record.DurationMS), boundMetadataJSON(record.Metadata))
	if err != nil {
		return err
	}
	if err = s.pruneOldestBeyondRetention(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}
