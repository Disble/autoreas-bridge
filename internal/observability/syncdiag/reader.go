package syncdiag

import (
	"context"
	"database/sql"

	"autoreas-bridge/internal/observability/obserr"
)

const (
	// defaultReportLimit is the number of reports List returns when the
	// query carries a zero or negative Limit, mirroring
	// requestcapture's defaultSearchLimit: bounded answers by default so an
	// unbounded caller can never drain the table in one query.
	defaultReportLimit = 25
	// maxReportLimit is the hard ceiling on List's page size, mirroring
	// requestcapture's maxSearchLimit. A caller requesting more than this
	// gets exactly this many rows; the cap is enforced in SQL, never by
	// post-query truncation.
	maxReportLimit = 100
)

// reportSelectColumns is the fixed SELECT column list List relies on. It is
// a read-only projection of device_sync_diagnostics: no recent_events_json,
// which stays a write-path storage detail no read surface consumes yet.
const reportSelectColumns = `
	device_id, reported_at_ms, cycle_id, degraded, trigger_source, app_state,
	consecutive_unclosed_cycles, pending_ops_count, cursor,
	previous_outcome, previous_elapsed_ms, previous_error_fingerprint`

// ReportQuery selects a bounded, newest-first page of diagnostics reports.
// An empty DeviceID applies no device predicate (every device's reports are
// returned); a zero or negative Limit means the package default,
// defaultReportLimit, clamped to maxReportLimit at the top.
type ReportQuery struct {
	// DeviceID restricts the page to one device's reports. Empty means no
	// device predicate.
	DeviceID string
	// Limit bounds the page size. Zero or negative means the package
	// default; values above maxReportLimit are clamped to it.
	Limit int
}

// Report is one read-side diagnostics report: the columns a per-device
// question actually needs, without the write path's storage details.
type Report struct {
	// DeviceID is the device the report is attributed to. device_sync_diagnostics
	// is the ONLY store that can attribute a report to a device: a
	// diagnostics capture in request_captures carries the report body but
	// not the device (the POST /api/sync/diagnostics body has no device_id;
	// identity travels only in the Authorization header).
	DeviceID string
	// ReportedAtMS is the client-reported epoch millisecond of the report.
	ReportedAtMS int64
	// CycleID is the unique sync-cycle identity the report belongs to.
	CycleID string
	// Degraded is a FIDELITY signal, not a health signal. Quoting the
	// schema's own reasoning: "degraded is a FIDELITY signal, not a health
	// signal ... It reports how complete the record is, not how the device
	// is doing -- degraded IS NOT NULL is not a health indicator."
	Degraded *string
	// TriggerSource is the only trustworthy discriminator of what started
	// the cycle.
	TriggerSource string
	// AppState is stored but is deliberately NOT a filter dimension: the
	// client hardcodes it to 'background', so a foreground_service cycle
	// also reports 'background'. TriggerSource is the discriminator.
	AppState string
	// ConsecutiveUnclosedCycles counts unclosed cycles at report time.
	ConsecutiveUnclosedCycles int
	// PendingOpsCount is the pending-operation count at report time.
	PendingOpsCount int
	// Cursor is the sync cursor value at report time.
	Cursor int
	// PreviousOutcome is the previous cycle's outcome, nil when the report
	// carried no previous_cycle object (every previous_* column is NULL
	// together).
	PreviousOutcome *string
	// PreviousElapsedMS is the previous cycle's elapsed milliseconds, nil
	// when absent.
	PreviousElapsedMS *int64
	// PreviousErrorFingerprint is the previous cycle's error fingerprint,
	// nil when absent.
	PreviousErrorFingerprint *string
}

// Reader provides read-only queries over device_sync_diagnostics. It never
// creates, migrates, or writes anything: the table is born through the
// write path's schema registration, and this type only reads it. It is a
// sibling of Store, never an extension of it.
type Reader struct {
	db        *sql.DB
	available bool
}

// NewReader builds a query helper over an already-open handle and probes
// once for device_sync_diagnostics, mirroring eventlog.NewReader. A missing
// table is NOT an error: Available() reports false and every query returns
// an unavailable envelope, so a bridge database predating the diagnostics
// table degrades instead of failing the whole read. The reader MUST NOT be
// given a handle it does not own writes for -- it performs no writes of any
// kind, so sharing the app's single bridgeDB handle is safe.
func NewReader(db *sql.DB) *Reader {
	return &Reader{db: db, available: syncDiagnosticsTableExists(db)}
}

// Available reports whether device_sync_diagnostics exists on the
// underlying handle.
func (r *Reader) Available() bool { return r.available }

// syncDiagnosticsTableExists probes sqlite_master for the
// device_sync_diagnostics table. Any query failure is treated as "absent"
// so callers degrade gracefully rather than erroring.
func syncDiagnosticsTableExists(db *sql.DB) bool {
	if db == nil {
		return false
	}
	var count int
	err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'device_sync_diagnostics'`).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

// List returns the newest-first, limit-bounded page of diagnostics reports
// matching the query. An empty DeviceID applies no device predicate; a
// device predicate still respects the availability gate, so a missing
// table yields an unavailable error rather than an empty slice. When
// nothing matches it returns an empty, never-nil slice.
func (r *Reader) List(ctx context.Context, query ReportQuery) ([]Report, error) {
	if r == nil || !r.available {
		return nil, obserr.Unavailable("device sync diagnostics unavailable")
	}

	statement := `SELECT ` + reportSelectColumns + ` FROM device_sync_diagnostics`
	args := []any{}
	if query.DeviceID != "" {
		statement += ` WHERE device_id = ?`
		args = append(args, query.DeviceID)
	}
	statement += ` ORDER BY reported_at_ms DESC LIMIT ?`
	args = append(args, clampReportLimit(query.Limit))

	rows, err := r.db.QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	reports := []Report{}
	for rows.Next() {
		report, scanErr := scanReport(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		reports = append(reports, report)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return reports, nil
}

// clampReportLimit applies the reader-side limit contract: zero or negative
// means the package default, and anything above maxReportLimit is capped at
// it.
func clampReportLimit(limit int) int {
	if limit <= 0 {
		return defaultReportLimit
	}
	if limit > maxReportLimit {
		return maxReportLimit
	}
	return limit
}

// nullableString converts a nullable scan target into its Report pointer
// form: NULL stays nil, a value becomes a pointer to it.
func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	copied := value.String
	return &copied
}

// nullableInt64 converts a nullable scan target into its Report pointer
// form: NULL stays nil, a value becomes a pointer to it.
func nullableInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	copied := value.Int64
	return &copied
}

// reportScanner is the minimal row interface Scan needs, satisfied by both
// *sql.Row and *sql.Rows.
type reportScanner interface {
	Scan(dest ...any) error
}

// scanReport reads one device_sync_diagnostics row into a Report. The
// nullable columns are scanned into dedicated targets so an absent value
// round-trips as a nil pointer, never as a zero value.
func scanReport(scanner reportScanner) (Report, error) {
	var report Report
	var degraded sql.NullString
	var previousOutcome sql.NullString
	var previousElapsedMS sql.NullInt64
	var previousErrorFingerprint sql.NullString
	if err := scanner.Scan(
		&report.DeviceID, &report.ReportedAtMS, &report.CycleID, &degraded,
		&report.TriggerSource, &report.AppState, &report.ConsecutiveUnclosedCycles,
		&report.PendingOpsCount, &report.Cursor,
		&previousOutcome, &previousElapsedMS, &previousErrorFingerprint,
	); err != nil {
		return Report{}, err
	}
	report.Degraded = nullableString(degraded)
	report.PreviousOutcome = nullableString(previousOutcome)
	report.PreviousElapsedMS = nullableInt64(previousElapsedMS)
	report.PreviousErrorFingerprint = nullableString(previousErrorFingerprint)
	return report, nil
}
