package eventlog

import (
	"context"
	"database/sql"

	"autoreas-bridge/internal/observability/obserr"
)

// SQLiteStore persists events into bridge SQLite's runtime_events table.
type SQLiteStore struct {
	db *sql.DB
}

// NewStore builds a SQLite-backed event store.
func NewStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
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

// InsertEvent stores one event record: marshal + redact + bound metadata via
// metadata.go before bind, then BEGIN/INSERT/COMMIT. Retention is the
// retention sweeper's job, not the write path's.
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
	return tx.Commit()
}
