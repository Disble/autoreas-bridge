package telemetry

import (
	"context"
	"encoding/json"

	"autoreas-bridge/internal/observability/syncdiag"
)

// CycleReportQuery selects a bounded, newest-first page of cycle_report
// events for one device. It is deliberately the envelope query minus the kind:
// a caller of a kind projection cannot choose to read another kind, because
// the projection is defined by the kind whose payload it decodes.
type CycleReportQuery struct {
	// DeviceID restricts the page to one device's reports. Empty means no
	// device predicate.
	DeviceID string
	// Limit bounds the page size, exactly as ReportQuery.Limit does.
	Limit int
}

// CycleReport is one read-side sync-cycle diagnostics report: the desktop
// DTO's values, projected out of the stored envelope and the stored payload.
//
// Every field that can be absent is a pointer, so a report that never carried
// a previous cycle and a report whose previous cycle was zero-valued stay
// distinguishable -- the distinction the retired table encoded as NULL.
type CycleReport struct {
	// DeviceID is the envelope's authenticated device.
	DeviceID string
	// ReportedAtMS is the envelope's receipt clock.
	ReportedAtMS int64
	// CycleID is the envelope's kind-scoped idempotency key, which for this
	// kind is the cycle identity mobile sent.
	CycleID string
	// Degraded is the envelope's fidelity signal, nil when absent.
	Degraded *string
	// TriggerSource is the only trustworthy discriminator of what started the
	// cycle.
	TriggerSource string
	// AppState is stored but is deliberately NOT a filter dimension: the
	// client hardcodes it to 'background', so a foreground_service cycle also
	// reports 'background'.
	AppState string
	// ConsecutiveUnclosedCycles counts unclosed cycles at report time.
	ConsecutiveUnclosedCycles int
	// PendingOpsCount is the pending-operation count at report time.
	PendingOpsCount int
	// Cursor is the sync cursor value at report time.
	Cursor int
	// PreviousOutcome is the previous cycle's outcome, nil when the report
	// carried no previous cycle.
	PreviousOutcome *string
	// PreviousElapsedMS is the previous cycle's elapsed milliseconds, nil
	// when absent.
	PreviousElapsedMS *int64
	// PreviousErrorFingerprint is the previous cycle's error fingerprint, nil
	// when absent.
	PreviousErrorFingerprint *string
}

// ListCycleReports returns the newest-first page of cycle_report events
// projected into this kind's read shape. It names its own kind in the
// envelope query, so the other kinds sharing device_telemetry_events can
// never appear in a sync-cycle read.
func (r *Reader) ListCycleReports(ctx context.Context, query CycleReportQuery) ([]CycleReport, error) {
	events, err := r.List(ctx, ReportQuery{
		DeviceID: query.DeviceID,
		Kind:     KindCycleReport,
		Limit:    query.Limit,
	})
	if err != nil {
		return nil, err
	}
	reports := make([]CycleReport, 0, len(events))
	for _, event := range events {
		reports = append(reports, toCycleReport(event))
	}
	return reports, nil
}

// toCycleReport projects one stored envelope row into a CycleReport.
//
// The envelope owns identity, attribution, receipt time and the fidelity
// signal, so those come from the columns and never from the payload: the
// stored contract omits them precisely so a payload copy could not contradict
// the column. Everything else is the payload's own content.
//
// A payload that does not unmarshal is a CORRUPT ROW, not a crash and not an
// empty report: the envelope-owned values still describe which row was
// unreadable, and the payload-derived values degrade to absent rather than to
// a false reported zero. Unknown keys are tolerated for the same reason this
// decode is not strict: the payload is the bridge's own bytes, so an
// unrecognized member is a signal the reader is older than the row, never a
// reason to discard a readable report.
func toCycleReport(event StoredEvent) CycleReport {
	report := CycleReport{
		DeviceID:     event.DeviceID,
		ReportedAtMS: event.ReportedAtMS,
		CycleID:      event.EventID,
		Degraded:     event.Degraded,
	}

	var record syncdiag.Record
	if err := json.Unmarshal(event.Payload, &record); err != nil {
		return report
	}

	report.TriggerSource = record.TriggerSource
	report.AppState = record.AppState
	report.ConsecutiveUnclosedCycles = record.ConsecutiveUnclosedCycles
	report.PendingOpsCount = record.PendingOpsCount
	report.Cursor = record.Cursor

	// The previous-cycle object is nullable as a whole: its absence is the
	// reason all three values are absent together, so one nil check owns all
	// three rather than three independent ones that could disagree.
	if record.PreviousCycle != nil {
		outcome := record.PreviousCycle.Outcome
		report.PreviousOutcome = &outcome
		report.PreviousElapsedMS = record.PreviousCycle.ElapsedMS
		report.PreviousErrorFingerprint = record.PreviousCycle.ErrorFingerprint
	}
	return report
}
