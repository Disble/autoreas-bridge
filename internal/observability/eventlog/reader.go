package eventlog

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"

	"autoreas-bridge/internal/observability/obserr"
)

// NewReader builds a query helper over an already-open handle and probes
// once for runtime_events. A missing table is NOT an error: Available()
// reports false and every query returns an unavailable envelope, so a
// sidecar pointed at a bridge database predating this change still serves
// the capture tools. This constructor MUST NOT be called from inside
// requestcapture.OpenReadOnlyDB -- that function fails closed on a capture
// schema mismatch, and probing runtime_events there would kill the sidecar
// for every pre-change database. The event reader is constructed after
// OpenReadOnlyDB succeeds, over the same already-verified handle.
func NewReader(db *sql.DB) *Reader {
	return &Reader{db: db, available: runtimeEventsTableExists(db)}
}

// Reader provides read-only runtime-event queries.
type Reader struct {
	db        *sql.DB
	available bool
}

// Available reports whether runtime_events exists on the underlying handle.
func (r *Reader) Available() bool { return r.available }

// runtimeEventsTableExists probes sqlite_master for the runtime_events
// table. Any query failure is treated as "absent" so callers degrade
// gracefully rather than erroring.
func runtimeEventsTableExists(db *sql.DB) bool {
	if db == nil {
		return false
	}
	var count int
	err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'runtime_events'`).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

// eventCursor is the pagination cursor for Search, keyed on
// (occurred_at_ms, id) -- the only stable pagination tiebreaker, since
// LogEntry has no natural id and Timestamp is RFC3339 second resolution.
type eventCursor struct {
	OccurredAtMS int64 `json:"occurred_at_ms"`
	ID           int64 `json:"id"`
}

// encodeEventCursor serializes the pagination cursor to URL-safe base64,
// mirroring requestcapture's encodeSearchCursor.
func encodeEventCursor(cursor eventCursor) string {
	encoded, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(encoded)
}

// decodeEventCursor parses a base64 event cursor into its parts.
func decodeEventCursor(value string) (eventCursor, error) {
	encoded, err := base64.RawURLEncoding.DecodeString(value)
	var cursor eventCursor
	if err != nil || json.Unmarshal(encoded, &cursor) != nil || cursor.ID == 0 {
		return eventCursor{}, obserr.InvalidParams("invalid search cursor")
	}
	return cursor, nil
}

// eventRowScan holds the nullable scan targets for one runtime_events row.
type eventRowScan struct {
	correlationID sql.NullString
	entityID      sql.NullString
	eventType     sql.NullString
	durationMS    sql.NullInt64
	metadataJSON  sql.NullString
}

// scanEventRow reads one runtime_events row into an EventRecord.
func scanEventRow(scanner interface{ Scan(dest ...any) error }) (EventRecord, error) {
	var record EventRecord
	var scan eventRowScan
	if err := scanner.Scan(
		&record.ID, &record.OccurredAtMS, &record.Domain, &record.Level, &record.Message,
		&scan.correlationID, &scan.entityID, &scan.eventType, &scan.durationMS, &scan.metadataJSON,
	); err != nil {
		return EventRecord{}, err
	}
	if scan.correlationID.Valid {
		record.CorrelationID = scan.correlationID.String
	}
	if scan.entityID.Valid {
		record.EntityID = scan.entityID.String
	}
	if scan.eventType.Valid {
		record.EventType = scan.eventType.String
	}
	if scan.durationMS.Valid {
		record.DurationMS = scan.durationMS.Int64
	}
	if scan.metadataJSON.Valid {
		var metadata map[string]any
		if err := json.Unmarshal([]byte(scan.metadataJSON.String), &metadata); err == nil {
			record.Metadata = metadata
		}
	}
	return record, nil
}

// eventSelectColumns is the fixed SELECT column list every runtime_events
// query relies on.
const eventSelectColumns = "id, occurred_at_ms, domain, level, message, correlation_id, entity_id, event_type, duration_ms, metadata_json"
