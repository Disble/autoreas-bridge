package telemetry

import (
	"context"
	"database/sql"
	"testing"
)

// insertCycleReportRows stores already-validated cycle_report rows without
// the kind's decoder, so a projection test can seed rows the write path would
// never produce -- a kind row written by an older build, or a corrupt one.
func insertCycleReportRow(t *testing.T, db *sql.DB, eventID, payload string, reportedAtMS int64, deviceID string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO device_telemetry_events (device_id, reported_at_ms, kind, event_id, payload_json)
		VALUES (?, ?, ?, ?, ?)
	`, deviceID, reportedAtMS, KindCycleReport, eventID, payload)
	if err != nil {
		t.Fatalf("insert cycle_report row %s: %v", eventID, err)
	}
}

// cycleReportReadStore writes through the real kind so the stored payload the
// projection reads is the payload production reads.
func cycleReportReadStore(db *sql.DB) *Store {
	return NewStore(db, StoreConfig{Registry: DefaultRegistry()})
}

// decodeCycleReportBody runs the real cycle_report decoder over a wire body,
// which is the only writer of a stored cycle_report payload.
func decodeCycleReportBody(t *testing.T, body string) Validated {
	t.Helper()

	validated, err := CycleReportKind{}.Decode([]byte(body))
	if err != nil {
		t.Fatalf("decode cycle report body: %v", err)
	}
	return validated
}

// TestListCycleReportsProjectsEveryStoredField pins the kind projection field
// by field, including the three values that used to be their own columns and
// now live inside the stored payload's previous_cycle object. They are the
// fields most likely to be dropped in the move, and a dropped one renders as
// an absent value, which looks exactly like a report that never had one.
func TestListCycleReportsProjectsEveryStoredField(t *testing.T) {
	t.Parallel()

	const body = `{
		"cycle_id": "cycle-full",
		"degraded": "events",
		"trigger_source": "foreground_service",
		"app_state": "background",
		"previous_cycle": {"outcome": "failed", "elapsed_ms": 1500, "error_fingerprint": "deadbeef"},
		"counters": {"consecutive_unclosed_cycles": 2, "pending_ops_count": 5, "cursor": 99},
		"recent_events": []
	}`

	db := openTelemetryStoreTestDB(t)
	store := cycleReportReadStore(db)
	validated := decodeCycleReportBody(t, body)
	if _, err := store.Insert(context.Background(), Event{
		DeviceID: "device-1", ReportedAtMS: 4000, Kind: KindCycleReport, Validated: validated,
	}); err != nil {
		t.Fatalf("insert cycle report: %v", err)
	}

	reports, err := NewReader(db).ListCycleReports(context.Background(), CycleReportQuery{})
	if err != nil {
		t.Fatalf("list cycle reports: %v", err)
	}
	if len(reports) != 1 {
		t.Fatalf("expected exactly one report, got %d (%#v)", len(reports), reports)
	}

	report := reports[0]
	if report.DeviceID != "device-1" || report.ReportedAtMS != 4000 {
		t.Fatalf("expected the envelope's device and receipt clock, got %#v", report)
	}
	// The cycle identity is the envelope's idempotency key: the payload's own
	// cycle_id copy is the stored contract's shape, never the row's identity.
	if report.CycleID != "cycle-full" {
		t.Fatalf("expected the envelope event_id as the cycle id, got %q", report.CycleID)
	}
	assertCycleReportScalars(t, report, cycleReportScalars{
		triggerSource: "foreground_service", appState: "background",
		consecutiveUnclosedCycles: 2, pendingOpsCount: 5, cursor: 99,
	})
	if report.Degraded == nil || *report.Degraded != "events" {
		t.Fatalf("expected the envelope's degraded column, got %v", report.Degraded)
	}
	assertCycleReportPrevious(t, report, &cycleReportPrevious{
		outcome: "failed", elapsedMS: 1500, errorFingerprint: "deadbeef",
	})
}

// TestListCycleReportsMapsAnExplicitNullPreviousCycleToAbsentFields asserts
// the three previous-cycle values are absent together when the report carried
// the wire's explicit previous_cycle: null -- never a zero-valued previous
// cycle rendered as though the device had reported one.
func TestListCycleReportsMapsAnExplicitNullPreviousCycleToAbsentFields(t *testing.T) {
	t.Parallel()

	const body = `{
		"cycle_id": "cycle-first",
		"degraded": null,
		"trigger_source": "background_task",
		"app_state": "foreground",
		"previous_cycle": null,
		"counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 1, "cursor": 7}
	}`

	db := openTelemetryStoreTestDB(t)
	store := cycleReportReadStore(db)
	if _, err := store.Insert(context.Background(), Event{
		DeviceID: "device-1", ReportedAtMS: 1000, Kind: KindCycleReport, Validated: decodeCycleReportBody(t, body),
	}); err != nil {
		t.Fatalf("insert cycle report: %v", err)
	}

	reports, err := NewReader(db).ListCycleReports(context.Background(), CycleReportQuery{})
	if err != nil {
		t.Fatalf("list cycle reports: %v", err)
	}
	if len(reports) != 1 {
		t.Fatalf("expected exactly one report, got %d (%#v)", len(reports), reports)
	}
	if reports[0].Degraded != nil {
		t.Fatalf("expected a null degraded to stay absent, got %v", reports[0].Degraded)
	}
	assertCycleReportScalars(t, reports[0], cycleReportScalars{
		triggerSource: "background_task", appState: "foreground", pendingOpsCount: 1, cursor: 7,
	})
	assertCycleReportPrevious(t, reports[0], nil)
}

// TestListCycleReportsExcludesAnotherKind asserts the projection is kind
// scoped: episode_action rows share the one table, and no amount of them may
// surface as sync-cycle reports.
func TestListCycleReportsExcludesAnotherKind(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	store := cycleReportReadStore(db)
	const body = `{"cycle_id": "cycle-1", "degraded": null, "trigger_source": "foreground_service", "app_state": "background", "previous_cycle": null, "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0}}`
	insertReaderEvents(t, store,
		Event{DeviceID: "device-1", ReportedAtMS: 1000, Kind: KindCycleReport,
			Validated: decodeCycleReportBody(t, body)},
		Event{DeviceID: "device-1", ReportedAtMS: 2000, Kind: KindEpisodeAction,
			Validated: Validated{EventID: "observation-1", Payload: []byte(`{"action":"episode_plus_one"}`)}},
	)

	reports, err := NewReader(db).ListCycleReports(context.Background(), CycleReportQuery{})
	if err != nil {
		t.Fatalf("list cycle reports: %v", err)
	}
	if len(reports) != 1 || reports[0].CycleID != "cycle-1" {
		t.Fatalf("expected only the cycle_report row, got %#v", reports)
	}
}

// TestListCycleReportsDegradesACorruptPayloadRow asserts a row whose payload
// does not unmarshal is a corrupt row, not a crash: the projection keeps what
// the envelope owns and degrades the payload-derived fields to absent, which
// is the only honest answer for a row whose content cannot be read.
func TestListCycleReportsDegradesACorruptPayloadRow(t *testing.T) {
	t.Parallel()

	db := openTelemetryStoreTestDB(t)
	// Written without the kind's decoder on purpose: this row is the shape
	// the write path cannot produce and the read path must still survive.
	insertCycleReportRow(t, db, "cycle-corrupt", `{"cycle_id":`, 5000, "device-9")

	reports, err := NewReader(db).ListCycleReports(context.Background(), CycleReportQuery{})
	if err != nil {
		t.Fatalf("list cycle reports: %v", err)
	}
	if len(reports) != 1 {
		t.Fatalf("expected the corrupt row to still be read, got %#v", reports)
	}
	report := reports[0]
	if report.DeviceID != "device-9" || report.ReportedAtMS != 5000 || report.CycleID != "cycle-corrupt" {
		t.Fatalf("expected the envelope columns to survive a corrupt payload, got %#v", report)
	}
	assertCycleReportScalars(t, report, cycleReportScalars{})
	assertCycleReportPrevious(t, report, nil)
}

// TestListCycleReportsDegradesWithoutTheTable asserts the projection inherits
// the envelope read's unavailability instead of turning an unreadable table
// into an empty, successful page -- a degraded read and a device that never
// reported must not look the same.
func TestListCycleReportsDegradesWithoutTheTable(t *testing.T) {
	t.Parallel()

	reports, err := NewReader(openTelemetryTestDB(t)).ListCycleReports(context.Background(), CycleReportQuery{DeviceID: "device-1"})
	if err == nil {
		t.Fatalf("expected an unavailable error for an absent table, got %#v", reports)
	}
	assertReaderUnavailableEnvelope(t, err)
}

// cycleReportScalars is the projection's non-nullable payload-derived surface,
// grouped so the two mapping tests assert it as one literal.
type cycleReportScalars struct {
	triggerSource             string
	appState                  string
	consecutiveUnclosedCycles int
	pendingOpsCount           int
	cursor                    int
}

// assertCycleReportScalars fails unless every non-nullable value matches.
func assertCycleReportScalars(t *testing.T, report CycleReport, want cycleReportScalars) {
	t.Helper()

	if report.TriggerSource != want.triggerSource || report.AppState != want.appState {
		t.Fatalf("expected trigger_source %q app_state %q, got %#v", want.triggerSource, want.appState, report)
	}
	if report.ConsecutiveUnclosedCycles != want.consecutiveUnclosedCycles ||
		report.PendingOpsCount != want.pendingOpsCount || report.Cursor != want.cursor {
		t.Fatalf("expected counters %#v, got %#v", want, report)
	}
}

// cycleReportPrevious is the projection's previous-cycle trio, grouped so a
// test states all three or none.
type cycleReportPrevious struct {
	outcome          string
	elapsedMS        int64
	errorFingerprint string
}

// assertCycleReportPrevious fails unless the previous-cycle trio matches, and
// requires all three to be absent together when want is nil.
func assertCycleReportPrevious(t *testing.T, report CycleReport, want *cycleReportPrevious) {
	t.Helper()

	if want == nil {
		if report.PreviousOutcome != nil || report.PreviousElapsedMS != nil || report.PreviousErrorFingerprint != nil {
			t.Fatalf("expected every previous-cycle value absent, got %#v", report)
		}
		return
	}
	if report.PreviousOutcome == nil || *report.PreviousOutcome != want.outcome {
		t.Fatalf("expected previous outcome %q, got %v", want.outcome, report.PreviousOutcome)
	}
	if report.PreviousElapsedMS == nil || *report.PreviousElapsedMS != want.elapsedMS {
		t.Fatalf("expected previous elapsed %d, got %v", want.elapsedMS, report.PreviousElapsedMS)
	}
	if report.PreviousErrorFingerprint == nil || *report.PreviousErrorFingerprint != want.errorFingerprint {
		t.Fatalf("expected previous error fingerprint %q, got %v", want.errorFingerprint, report.PreviousErrorFingerprint)
	}
}
