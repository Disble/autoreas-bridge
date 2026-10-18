package incident

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// SourceKind names which recorder fact fired an incident.
type SourceKind string

const (
	// SourceRequest is a terminal request capture; its source id is the request id.
	SourceRequest SourceKind = "request"
	// SourceEvent is a persisted runtime event.
	SourceEvent SourceKind = "event"
	// SourceMobile is a stored mobile telemetry report; its source id is the event id.
	SourceMobile SourceKind = "mobile"
)

const insertIncidentSQL = `
	INSERT INTO incidents (
		fingerprint, reason, occurred_at_ms, window_start_ms, window_end_ms, source_kind, source_id
	) VALUES (?, ?, ?, ?, ?, ?, ?)`

// Occurrence is one fired trigger to persist: what fired, when, and which
// recorder fact it came from. The pinned window is derived from OccurredAt.
type Occurrence struct {
	Trigger    Trigger
	OccurredAt time.Time
	SourceKind SourceKind
	SourceID   string
}

// Store persists incident occurrences into the incidents table. It only
// inserts: keeping the first and latest occurrences per fingerprint is the
// retention sweeper's job.
type Store struct {
	db *sql.DB
}

// NewStore builds a SQLite-backed incident store.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Record inserts one occurrence with the Window around its time.
func (s *Store) Record(ctx context.Context, occurrence Occurrence) error {
	if s.db == nil {
		return errors.New("incident: store unavailable")
	}
	from, to := Window(occurrence.OccurredAt)
	_, err := s.db.ExecContext(ctx, insertIncidentSQL,
		occurrence.Trigger.Fingerprint, string(occurrence.Trigger.Reason), occurrence.OccurredAt.UnixMilli(),
		from.UnixMilli(), to.UnixMilli(), string(occurrence.SourceKind), occurrence.SourceID)
	return err
}
