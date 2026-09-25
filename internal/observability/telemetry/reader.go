package telemetry

import (
	"context"
	"database/sql"
	"strings"

	"autoreas-bridge/internal/observability/obserr"
)

const (
	// defaultPageLimit is the number of events List returns when the query
	// carries a zero or negative Limit, mirroring requestcapture's
	// defaultSearchLimit: bounded answers by default, so an unbounded caller
	// can never drain the one table every kind shares.
	defaultPageLimit = 25
	// maxPageLimit is the hard ceiling on List's page size, mirroring
	// requestcapture's maxSearchLimit. A caller asking for more gets exactly
	// this many rows, enforced by the SQL LIMIT rather than by truncating a
	// larger result set after the fact.
	maxPageLimit = 100
)

// eventSelectColumns is the fixed SELECT column list List relies on: the
// envelope whose columns every kind shares, and never a payload field. A
// kind's own projection reads Payload instead, so adding a kind adds no
// column here and no branch.
const eventSelectColumns = `
	device_id, reported_at_ms, kind, event_id, observed_at_ms, degraded, payload_json`

// ReportQuery selects a bounded, newest-first page of stored telemetry
// events. Both predicates are optional and omitted predicates are omitted
// from the SQL, not satisfied by a sentinel value: an empty DeviceID is
// "every device" and an empty Kind is "every kind", which is the envelope
// read a kind-agnostic caller performs.
type ReportQuery struct {
	// DeviceID restricts the page to one device's events. Empty means no
	// device predicate.
	DeviceID string
	// Kind restricts the page to one kind's events. Empty means no kind
	// predicate; a kind's own projection always names its kind, because the
	// one table holds every kind's rows.
	Kind KindName
	// Limit bounds the page size. Zero or negative means the package
	// default; values above maxPageLimit are clamped to it.
	Limit int
}

// StoredEvent is one read-side telemetry event: the envelope columns every
// kind shares, plus the kind's own stored payload left encoded. Decoding a
// payload is the kind's business, so this type is complete for every kind
// that will ever be registered and never has to change when one is added.
type StoredEvent struct {
	// DeviceID is the authenticated device the event was attributed to. It
	// comes from the bearer token, never from the body, which is why this
	// read is the only attributed source of a device's own telemetry.
	DeviceID string
	// ReportedAtMS is the bridge's receipt clock, not a client timestamp.
	ReportedAtMS int64
	// Kind is the wire discriminator the event was stored under.
	Kind KindName
	// EventID is the kind-scoped idempotency key, unique within its kind.
	EventID string
	// ObservedAtMS is the nullable client event time, nil when the kind's
	// body carried none.
	ObservedAtMS *int64
	// Degraded is the nullable fidelity signal: how complete the record is,
	// never how the device is doing.
	Degraded *string
	// Payload is the kind's stored JSON, exactly as the kind serialized it.
	Payload []byte
}

// Reader provides read-only queries over device_telemetry_events. It never
// creates, migrates, or writes anything: the table is born through the write
// path's schema registration, and this type only reads it. It is a sibling of
// Store, never an extension of it, and it lives here rather than with any one
// kind because the envelope outlives every kind that grows inside it.
type Reader struct {
	db        *sql.DB
	available bool
}

// NewReader builds a query helper over an already-open handle and probes once
// for device_telemetry_events, mirroring eventlog.NewReader. A missing table
// is NOT an error: Available() reports false and every query returns an
// unavailable envelope, so a bridge database predating the table degrades
// instead of failing the whole read. The reader MUST NOT be given a handle it
// does not own writes for -- it performs no writes of any kind, so sharing
// the app's single bridgeDB handle is safe.
func NewReader(db *sql.DB) *Reader {
	return &Reader{db: db, available: deviceTelemetryEventsTableExists(db)}
}

// Available reports whether device_telemetry_events exists on the underlying
// handle.
func (r *Reader) Available() bool { return r.available }

// deviceTelemetryEventsTableExists probes sqlite_master for the telemetry
// table. Any query failure is treated as "absent" so callers degrade
// gracefully rather than erroring.
func deviceTelemetryEventsTableExists(db *sql.DB) bool {
	if db == nil {
		return false
	}
	var count int
	err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'device_telemetry_events'`).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

// List returns the newest-first, limit-bounded page of stored events matching
// the query. An absent table yields an unavailable error rather than an empty
// slice: a caller can never mistake a database that cannot answer for a
// device that never reported. When nothing matches it returns an empty,
// never-nil slice.
func (r *Reader) List(ctx context.Context, query ReportQuery) ([]StoredEvent, error) {
	if r == nil || !r.available {
		return nil, obserr.Unavailable("telemetry events unavailable")
	}

	statement := `SELECT ` + eventSelectColumns + ` FROM device_telemetry_events`
	args := []any{}
	conditions := make([]string, 0, 2)
	if query.DeviceID != "" {
		conditions = append(conditions, "device_id = ?")
		args = append(args, query.DeviceID)
	}
	if query.Kind != "" {
		conditions = append(conditions, "kind = ?")
		args = append(args, query.Kind)
	}
	if len(conditions) > 0 {
		statement += ` WHERE ` + strings.Join(conditions, ` AND `)
	}
	statement += ` ORDER BY reported_at_ms DESC LIMIT ?`
	args = append(args, clampPageLimit(query.Limit))

	rows, err := r.db.QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	events := []StoredEvent{}
	for rows.Next() {
		event, scanErr := scanStoredEvent(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

// clampPageLimit applies the reader-side limit contract: zero or negative
// means the package default, and anything above maxPageLimit is capped at it.
func clampPageLimit(limit int) int {
	if limit <= 0 {
		return defaultPageLimit
	}
	if limit > maxPageLimit {
		return maxPageLimit
	}
	return limit
}

// storedEventScanner is the minimal row interface Scan needs, satisfied by
// both *sql.Row and *sql.Rows.
type storedEventScanner interface {
	Scan(dest ...any) error
}

// scanStoredEvent reads one envelope row. The two nullable columns are
// scanned into dedicated targets so an absent value round-trips as a nil
// pointer, never as a zero value that a caller cannot tell from a reported
// zero.
func scanStoredEvent(scanner storedEventScanner) (StoredEvent, error) {
	var event StoredEvent
	var observedAtMS sql.NullInt64
	var degraded sql.NullString
	if err := scanner.Scan(
		&event.DeviceID, &event.ReportedAtMS, &event.Kind, &event.EventID,
		&observedAtMS, &degraded, &event.Payload,
	); err != nil {
		return StoredEvent{}, err
	}
	event.ObservedAtMS = nullableInt64(observedAtMS)
	event.Degraded = nullableString(degraded)
	return event, nil
}

// nullableString converts a nullable scan target into its pointer form:
// NULL stays nil, a value becomes a pointer to it.
func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	copied := value.String
	return &copied
}

// nullableInt64 converts a nullable scan target into its pointer form: NULL
// stays nil, a value becomes a pointer to it.
func nullableInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	copied := value.Int64
	return &copied
}
