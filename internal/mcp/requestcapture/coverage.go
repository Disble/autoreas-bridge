package requestcapture

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/observability/retention"
)

// TimeRange is a span of epoch milliseconds, also rendered as UTC RFC 3339.
type TimeRange struct {
	FromMS  int64  `json:"from_ms"`
	ToMS    int64  `json:"to_ms"`
	FromISO string `json:"from_iso"`
	ToISO   string `json:"to_iso"`
}

// Instant is one epoch-millisecond time, also rendered as UTC RFC 3339.
type Instant struct {
	MS  int64  `json:"ms"`
	ISO string `json:"iso"`
}

// SourceRange is the oldest and newest row one source table holds. Range is
// null when the table holds no row.
//
// A recorder table (request_captures, runtime_events) keeps every row only
// for retention.RecorderSpan; older rows survive only for the ledger classes
// and incident windows. For those tables CompleteFrom is the time from which
// every row is held (the later of the oldest row and now minus the recorder
// span), and BeforeCompleteFrom says what survives before it.
type SourceRange struct {
	Source             string     `json:"source"`
	Range              *TimeRange `json:"range"`
	CompleteFrom       *Instant   `json:"complete_from,omitempty"`
	BeforeCompleteFrom string     `json:"before_complete_from,omitempty"`
}

// Coverage states what an answer read, so an empty answer is never read as
// "nothing happened" (docs/observability/architecture.md, Readers).
//
// Sources lists every table the answer read with the time range it actually
// holds. Window is the span the question asked about; it is null for a read
// by key. Covered is the part of the window the sources hold: from the
// oldest to the newest row, clipped to the window, and null when they hold
// nothing inside it. An answer that needs every row (one request, one run
// story, the recorder) starts Covered at the recorder tables' CompleteFrom.
type Coverage struct {
	Sources []SourceRange `json:"sources"`
	Window  *TimeRange    `json:"window"`
	Covered *TimeRange    `json:"covered"`
}

// source is one table an answer reads, with the columns holding its oldest
// and newest time. The fields are interpolated into SQL, so a source is only
// ever one of the package-level literals below, never caller input. A source
// whose table another package owns reads its range through that package
// instead (read). A recorder table names what survives the recorder span
// (beforeComplete); other tables are kept whole for the ledger span.
type source struct {
	table, oldestColumn, newestColumn string
	read                              func(context.Context, *sql.DB) (*TimeRange, error)
	beforeComplete                    string
}

// The tables the Activity read service reads. Each time column leads an
// index or a primary key except incidents.occurred_at_ms (trimmed to six rows
// per fingerprint), device_telemetry_events.reported_at_ms (its indexes lead
// with kind and device) and the response_versions times (one row per
// distinct body), which are small tables.
var (
	sourceCaptures = source{table: "request_captures", oldestColumn: "captured_at_ms", newestColumn: "captured_at_ms",
		beforeComplete: "only writes, WebSocket connections, non-noise events and incident windows are kept"}
	sourceEvents = source{table: "runtime_events", oldestColumn: "occurred_at_ms", newestColumn: "occurred_at_ms",
		beforeComplete: "only non-noise events and incident windows are kept"}
	sourceRollup    = source{table: "request_rollup_hourly", oldestColumn: "hour_ms", newestColumn: "hour_ms"}
	sourceIncidents = source{table: "incidents", oldestColumn: "occurred_at_ms", newestColumn: "occurred_at_ms"}
	sourceTelemetry = source{table: "device_telemetry_events", oldestColumn: "reported_at_ms", newestColumn: "reported_at_ms"}
	sourceChanges   = source{table: "domain_history", read: domainHistoryRange}
	sourceVersions  = source{table: "response_versions", oldestColumn: "first_seen_ms", newestColumn: "last_seen_ms"}
)

// errStopStream ends the oldest-first stream after its first row.
var errStopStream = errors.New("stop after the oldest change")

// domainHistoryRange reads the oldest and newest change through
// internal/activity, which owns the domain history table: the newest row of
// its newest-first list and the first row of its oldest-first stream, both
// served by its time index.
func domainHistoryRange(ctx context.Context, db *sql.DB) (*TimeRange, error) {
	store := activity.NewStore(activity.NewSQLiteProvider(db))
	newest, err := store.ListRecent(ctx, activity.ListQuery{Limit: 1})
	if err != nil {
		return nil, fmt.Errorf("coverage of the domain history: %w", err)
	}
	if len(newest) == 0 {
		return nil, nil
	}
	var oldestMS int64
	err = store.StreamOldestFirst(ctx, func(change activity.ProgressEvent) error {
		oldestMS = change.OccurredAtMs
		return errStopStream
	})
	if err != nil && !errors.Is(err, errStopStream) {
		return nil, fmt.Errorf("coverage of the domain history: %w", err)
	}
	return newTimeRange(oldestMS, newest[0].OccurredAtMs), nil
}

// newTimeRange builds a range from two epoch milliseconds.
func newTimeRange(fromMS, toMS int64) *TimeRange {
	return &TimeRange{FromMS: fromMS, ToMS: toMS, FromISO: isoMS(fromMS), ToISO: isoMS(toMS)}
}

// isoMS renders epoch milliseconds as UTC RFC 3339.
func isoMS(ms int64) string {
	return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano)
}

// windowBefore returns the window of span ending at now.
func windowBefore(now time.Time, span time.Duration) *TimeRange {
	return newTimeRange(now.Add(-span).UnixMilli(), now.UnixMilli())
}

// coverage answers an answer read from ledger or incident data, which the
// sources keep whole for the ledger span.
func (t tools) coverage(ctx context.Context, window *TimeRange, sources ...source) (Coverage, error) {
	return readCoverage(ctx, t.reader.db(), t.now(), window, false, sources...)
}

// fullCoverage answers an answer that needs every row: a recorder table
// covers it only from its CompleteFrom.
func (t tools) fullCoverage(ctx context.Context, window *TimeRange, sources ...source) (Coverage, error) {
	return readCoverage(ctx, t.reader.db(), t.now(), window, true, sources...)
}

// readCoverage reads the range of each source and clips their union to
// window. With everyRow, a recorder table contributes only from its
// CompleteFrom, and nothing when it holds no row after it.
func readCoverage(ctx context.Context, db *sql.DB, now time.Time, window *TimeRange, everyRow bool, sources ...source) (Coverage, error) {
	coverage := Coverage{Sources: make([]SourceRange, 0, len(sources)), Window: window}
	var union *TimeRange
	for _, s := range sources {
		held, err := sourceRange(ctx, db, s)
		if err != nil {
			return Coverage{}, err
		}
		entry := SourceRange{Source: s.table, Range: held}
		if held != nil && s.beforeComplete != "" {
			completeMS := max(held.FromMS, now.Add(-retention.RecorderSpan).UnixMilli())
			entry.CompleteFrom = &Instant{MS: completeMS, ISO: isoMS(completeMS)}
			entry.BeforeCompleteFrom = s.beforeComplete
			if everyRow {
				held = clip(held, newTimeRange(completeMS, held.ToMS))
			}
		}
		coverage.Sources = append(coverage.Sources, entry)
		if held == nil {
			continue
		}
		if union == nil {
			union = newTimeRange(held.FromMS, held.ToMS)
			continue
		}
		union = newTimeRange(min(union.FromMS, held.FromMS), max(union.ToMS, held.ToMS))
	}
	coverage.Covered = clip(union, window)
	return coverage, nil
}

// clip returns the part of held inside window, or nil when none is.
func clip(held, window *TimeRange) *TimeRange {
	if held == nil || window == nil {
		return held
	}
	from, to := max(held.FromMS, window.FromMS), min(held.ToMS, window.ToMS)
	if from > to {
		return nil
	}
	return newTimeRange(from, to)
}

// sourceRange reads the oldest and newest time one table holds. MIN and MAX
// run as two statements because SQLite answers a lone MIN or MAX of an
// indexed column from the index, and a combined one by scanning.
func sourceRange(ctx context.Context, db *sql.DB, s source) (*TimeRange, error) {
	if s.read != nil {
		return s.read(ctx, db)
	}
	var oldest, newest sql.NullInt64
	// NOSONAR go:S2077 -- table and columns come from the package-level source literals, never caller data.
	if err := db.QueryRowContext(ctx, "SELECT MIN("+s.oldestColumn+") FROM "+s.table).Scan(&oldest); err != nil { // NOSONAR
		return nil, fmt.Errorf("coverage of %s: %w", s.table, err)
	}
	if !oldest.Valid {
		return nil, nil
	}
	if err := db.QueryRowContext(ctx, "SELECT MAX("+s.newestColumn+") FROM "+s.table).Scan(&newest); err != nil { // NOSONAR
		return nil, fmt.Errorf("coverage of %s: %w", s.table, err)
	}
	return newTimeRange(oldest.Int64, newest.Int64), nil
}
