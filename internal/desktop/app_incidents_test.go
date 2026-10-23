package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/syncdiag"
	"autoreas-bridge/internal/observability/telemetry"
)

// incidentTestProcessStart is the process start of every incident test app.
var incidentTestProcessStart = time.UnixMilli(1_760_000_000_000)

// incidentRow is one incidents row as read back by the tests.
type incidentRow struct {
	reason, sourceKind, sourceID string
}

// readIncidentRows returns every incidents row in insertion order.
func readIncidentRows(t *testing.T, db *sql.DB) []incidentRow {
	t.Helper()
	rows, err := db.Query(`SELECT reason, source_kind, source_id FROM incidents ORDER BY id`)
	if err != nil {
		t.Fatalf("query incidents: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var got []incidentRow
	for rows.Next() {
		var row incidentRow
		if err := rows.Scan(&row.reason, &row.sourceKind, &row.sourceID); err != nil {
			t.Fatalf("scan incident: %v", err)
		}
		got = append(got, row)
	}
	return got
}

// incidentTestLogger records every entry the shared fan-out logger writes.
type incidentTestLogger struct {
	entries []sharedlogger.LogEntry
}

// WriteEntry records one fanned-out entry.
func (l *incidentTestLogger) WriteEntry(entry sharedlogger.LogEntry) {
	l.entries = append(l.entries, entry)
}

// fanout wraps the recorder in the concrete shared logger type App holds.
func (l *incidentTestLogger) fanout() *sharedlogger.FanoutLogger {
	return sharedlogger.NewFanoutLoggerWithSinks(nil, l)
}

// newIncidentTestApp returns an app over a bootstrapped bridge database.
func newIncidentTestApp(t *testing.T) *App {
	t.Helper()
	return &App{bridgeDB: captureAppTestDB(t), processStartedAt: incidentTestProcessStart}
}

// failingIncidentDB returns a bootstrapped bridge database whose incidents
// table was dropped, so every incident write fails while every other write
// still succeeds.
func failingIncidentDB(t *testing.T) *sql.DB {
	t.Helper()
	db := captureAppTestDB(t)
	if _, err := db.Exec(`DROP TABLE incidents`); err != nil {
		t.Fatalf("drop incidents: %v", err)
	}
	return db
}

// terminalCapture builds a terminal HTTP capture with the given status.
func terminalCaptureRecord(requestID string, status int) requestcapture.CaptureRecord {
	record := requestcapture.BuildTransportCaptureRecord(requestID,
		incidentTestProcessStart.Add(time.Hour).UnixMilli(), "patch", "/api/animes/a1", "http")
	record.Outcome = "completed"
	record.HTTPStatus = &status
	duration := int64(12)
	record.DurationMS = &duration
	return record
}

// persistThroughDefaultCaptureQueue writes records through the capture queue
// the app builds by default, so the OnPersist wiring is what runs.
func persistThroughDefaultCaptureQueue(t *testing.T, app *App, records ...requestcapture.CaptureRecord) {
	t.Helper()
	app.ensureCaptureRuntimeDependencies()
	queue := app.newCaptureQueue(app.bridgeDB)
	for _, record := range records {
		if !queue.TryEnqueue(record) {
			t.Fatalf("enqueue %s", record.RequestID)
		}
	}
	if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
		t.Fatalf("capture queue did not drain: %#v", result)
	}
}

// TestCapturePersistRecordsIncidentOnlyForFailures asserts the terminal
// capture hook records one incident for a 5xx and none for a 200 or for a
// pending arrival row.
func TestCapturePersistRecordsIncidentOnlyForFailures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		record requestcapture.CaptureRecord
		want   []incidentRow
	}{
		{"5xx terminal capture", terminalCaptureRecord("req-500", 500),
			[]incidentRow{{reason: "server_error", sourceKind: "request", sourceID: "req-500"}}},
		{"200 terminal capture", terminalCaptureRecord("req-200", 200), nil},
		{"pending arrival", requestcapture.BuildTransportCaptureRecord("req-arrival",
			incidentTestProcessStart.Add(time.Hour).UnixMilli(), "patch", "/api/animes/a1", "http"), nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			app := newIncidentTestApp(t)

			persistThroughDefaultCaptureQueue(t, app, tt.record)

			got := readIncidentRows(t, app.bridgeDB)
			if len(got) != len(tt.want) || (len(got) == 1 && got[0] != tt.want[0]) {
				t.Fatalf("incidents = %#v, want %#v", got, tt.want)
			}
		})
	}
}

// TestDroppedTerminalRepairRecordsIncident asserts the direct terminal write
// that repairs a capture the queue dropped under load records the incident a
// queued 5xx would have recorded, and a repaired 200 records none.
func TestDroppedTerminalRepairRecordsIncident(t *testing.T) {
	t.Parallel()

	app := newIncidentTestApp(t)
	app.ensureCaptureRuntimeDependencies()

	app.persistCaptureTerminal(terminalCaptureRecord("req-repaired-200", 200))
	app.persistCaptureTerminal(terminalCaptureRecord("req-repaired-500", 500))

	got := readIncidentRows(t, app.bridgeDB)
	want := incidentRow{reason: "server_error", sourceKind: "request", sourceID: "req-repaired-500"}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("incidents = %#v, want [%#v]", got, want)
	}
}

// TestFailedTerminalRepairLogsAndRecordsNoIncident asserts a repair write that
// fails is logged once as a warning and records no incident for a row that
// never persisted.
func TestFailedTerminalRepairLogsAndRecordsNoIncident(t *testing.T) {
	t.Parallel()

	logger := &incidentTestLogger{}
	app := &App{bridgeDB: captureAppTestDB(t), processStartedAt: incidentTestProcessStart, sharedLogger: logger.fanout()}
	if _, err := app.bridgeDB.Exec(`DROP TABLE request_captures`); err != nil {
		t.Fatalf("drop request_captures: %v", err)
	}
	app.ensureCaptureRuntimeDependencies()

	app.persistCaptureTerminal(terminalCaptureRecord("req-lost-500", 500))

	if got := readIncidentRows(t, app.bridgeDB); len(got) != 0 {
		t.Fatalf("expected no incident for an unpersisted row, got %#v", got)
	}
	if len(logger.entries) != 1 || logger.entries[0].Level != sharedlogger.LevelWarn {
		t.Fatalf("expected one warning, got %#v", logger.entries)
	}
}

// TestRecordIncidentLogsOnlyFailuresAndToleratesNoLogger asserts a successful
// incident write logs nothing, and a failing write without a logger neither
// panics nor records a row.
func TestRecordIncidentLogsOnlyFailuresAndToleratesNoLogger(t *testing.T) {
	t.Parallel()

	logger := &incidentTestLogger{}
	app := &App{bridgeDB: captureAppTestDB(t), processStartedAt: incidentTestProcessStart, sharedLogger: logger.fanout()}
	app.recordRequestIncident(terminalCaptureRecord("req-ok-log", 500))
	if got := readIncidentRows(t, app.bridgeDB); len(got) != 1 || len(logger.entries) != 0 {
		t.Fatalf("expected one incident and no log, got %#v and %#v", got, logger.entries)
	}

	silent := &App{bridgeDB: failingIncidentDB(t), processStartedAt: incidentTestProcessStart}
	silent.recordRequestIncident(terminalCaptureRecord("req-no-logger", 500))
}

// TestCaptureIncidentFailureIsLoggedAndCaptureStillPersists asserts a failing
// incident store logs one error under the record-failed event type while the
// capture row is still written.
func TestCaptureIncidentFailureIsLoggedAndCaptureStillPersists(t *testing.T) {
	t.Parallel()
	logger := &incidentTestLogger{}
	app := &App{bridgeDB: failingIncidentDB(t), processStartedAt: incidentTestProcessStart, sharedLogger: logger.fanout()}

	persistThroughDefaultCaptureQueue(t, app, terminalCaptureRecord("req-500", 500))

	if got := countCaptureRows(t, app.bridgeDB); got != 1 {
		t.Fatalf("expected the capture row to persist, got %d rows", got)
	}
	assertOneIncidentFailureLogged(t, logger)
}

// assertOneIncidentFailureLogged asserts exactly one error-level entry under
// the incident-record-failed event type was logged.
func assertOneIncidentFailureLogged(t *testing.T, logger *incidentTestLogger) {
	t.Helper()
	if len(logger.entries) != 1 {
		t.Fatalf("expected one logged failure, got %#v", logger.entries)
	}
	entry := logger.entries[0]
	if entry.Level != sharedlogger.LevelError || entry.EventType != incidentRecordFailedEventType {
		t.Fatalf("unexpected failure entry %#v", entry)
	}
}

// TestEventPersistRecordsIncidentForErrorsOnly asserts the default event
// queue's persist hook records an incident for an error-level event and none
// for a warning.
func TestEventPersistRecordsIncidentForErrorsOnly(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		level string
		want  int
	}{
		{"error event", sharedlogger.LevelError, 1},
		{"warn event", sharedlogger.LevelWarn, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			app := newIncidentTestApp(t)
			app.ensureRuntimeObservability()
			queue, ok := app.newEventQueue(app.bridgeDB).(*eventlog.Queue)
			if !ok {
				t.Fatal("expected the default event queue to be *eventlog.Queue")
			}

			queue.TryEnqueue(eventlog.EventRecord{
				OccurredAtMS: incidentTestProcessStart.UnixMilli(), Domain: "downloads",
				Level: tt.level, Message: "boom", EventType: "download.failed",
			})
			queue.Stop(context.Background())

			got := readIncidentRows(t, app.bridgeDB)
			if len(got) != tt.want {
				t.Fatalf("incidents = %#v, want %d", got, tt.want)
			}
			if tt.want == 1 && (got[0].reason != "error_event" || got[0].sourceKind != "event") {
				t.Fatalf("unexpected incident %#v", got[0])
			}
		})
	}
}

// TestEventIncidentFailureDoesNotFeedBack asserts the feedback-loop guard: a
// failing incident store logs one failure for an error event, and that
// failure entry, once persisted and fed back to the hook, neither records nor
// logs again.
func TestEventIncidentFailureDoesNotFeedBack(t *testing.T) {
	t.Parallel()
	logger := &incidentTestLogger{}
	app := &App{bridgeDB: failingIncidentDB(t), sharedLogger: logger.fanout()}

	app.recordEventIncident(eventlog.EventRecord{Domain: "downloads", Level: sharedlogger.LevelError, EventType: "download.failed"})
	assertOneIncidentFailureLogged(t, logger)

	failure := logger.entries[0]
	app.recordEventIncident(eventlog.EventRecord{
		Domain: failure.Domain, Level: failure.Level, EventType: failure.EventType,
	})
	if len(logger.entries) != 1 {
		t.Fatalf("the failure entry fed back into the hook: %#v", logger.entries)
	}
}

// TestEventIncidentGuardSkipsOnlyRecordFailures asserts the guard is scoped:
// with a working store, a record-failed entry records nothing while another
// error event of the same domain records one incident.
func TestEventIncidentGuardSkipsOnlyRecordFailures(t *testing.T) {
	t.Parallel()
	app := newIncidentTestApp(t)

	app.recordEventIncident(eventlog.EventRecord{
		Domain: incidentLogDomain, Level: sharedlogger.LevelError, EventType: incidentRecordFailedEventType,
	})
	if got := readIncidentRows(t, app.bridgeDB); len(got) != 0 {
		t.Fatalf("a record-failed entry must not record an incident, got %#v", got)
	}

	app.recordEventIncident(eventlog.EventRecord{
		Domain: incidentLogDomain, Level: sharedlogger.LevelError, EventType: "other.failure",
	})
	if got := readIncidentRows(t, app.bridgeDB); len(got) != 1 {
		t.Fatalf("expected one incident for another error event, got %#v", got)
	}
}

// TestLoggedErrorEventRecordsOneIncidentEndToEnd asserts the real fan-out
// path: an error logged through the shared logger is persisted by the bound
// event queue and records exactly one incident.
func TestLoggedErrorEventRecordsOneIncidentEndToEnd(t *testing.T) {
	t.Parallel()
	app := newIncidentTestApp(t)
	app.ensureRuntimeObservability()
	app.configureEventLogQueue(context.Background())
	if app.eventQueue == nil {
		t.Fatal("expected the event queue to be bound")
	}

	app.sharedLogger.Errorf("downloads", "end-to-end incident failure")
	waitForRuntimeEventRow(t, app.bridgeDB, "end-to-end incident failure")
	app.eventQueue.Stop(context.Background())

	got := readIncidentRows(t, app.bridgeDB)
	if len(got) != 1 || got[0].reason != "error_event" {
		t.Fatalf("expected one error_event incident, got %#v", got)
	}
}

// mobileTestEvent builds a stored telemetry event of the given kind and payload.
func mobileTestEvent(t *testing.T, kind telemetry.KindName, eventID string, payload any) telemetry.Event {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return telemetry.Event{
		DeviceID: "device-1", ReportedAtMS: incidentTestProcessStart.UnixMilli(), Kind: kind,
		Validated: telemetry.Validated{EventID: eventID, Payload: encoded},
	}
}

// incidentTestCause is the error cause of the failed mobile test reports.
var incidentTestCause = "network"

// TestMobileReportRecordsIncidentOnlyForFailures asserts a failed cycle
// report and a failed episode action each record one incident, and a
// successful cycle report records none.
func TestMobileReportRecordsIncidentOnlyForFailures(t *testing.T) {
	t.Parallel()

	failedOutcome := "failed"
	tests := []struct {
		name  string
		event func(t *testing.T) telemetry.Event
		want  []incidentRow
	}{
		{"failed cycle report", func(t *testing.T) telemetry.Event {
			return mobileTestEvent(t, telemetry.KindCycleReport, "cycle-1", syncdiag.Record{
				CycleID: "cycle-1", RecentEvents: []syncdiag.RecentEvent{},
				PreviousCycle: &syncdiag.PreviousCycle{Outcome: "failed", ErrorCause: &incidentTestCause},
			})
		}, []incidentRow{{reason: "mobile_failure", sourceKind: "mobile", sourceID: "cycle-1"}}},
		{"successful cycle report", func(t *testing.T) telemetry.Event {
			return mobileTestEvent(t, telemetry.KindCycleReport, "cycle-2", syncdiag.Record{
				CycleID: "cycle-2", RecentEvents: []syncdiag.RecentEvent{},
				PreviousCycle: &syncdiag.PreviousCycle{Outcome: "completed"},
			})
		}, nil},
		{"failed episode action", func(t *testing.T) telemetry.Event {
			return mobileTestEvent(t, telemetry.KindEpisodeAction, "obs-1", map[string]any{
				"action": "episode_plus_one", "phase": "finished", "correlation_id": "c1",
				"outcome": failedOutcome, "reason": nil, "cause": incidentTestCause, "duration_ms": 40,
			})
		}, []incidentRow{{reason: "mobile_failure", sourceKind: "mobile", sourceID: "obs-1"}}},
		{"ten-second screen stall", func(t *testing.T) telemetry.Event {
			return mobileTestEvent(t, telemetry.KindScreenStall, "stall-1", map[string]any{"duration_ms": 10000, "trigger": "resize"})
		}, []incidentRow{{reason: "mobile_failure", sourceKind: "mobile", sourceID: "stall-1"}}},
		{"short screen stall", func(t *testing.T) telemetry.Event {
			return mobileTestEvent(t, telemetry.KindScreenStall, "stall-2", map[string]any{"duration_ms": 9999, "trigger": "resize"})
		}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			app := newIncidentTestApp(t)

			app.recordMobileIncident(tt.event(t))

			got := readIncidentRows(t, app.bridgeDB)
			if len(got) != len(tt.want) || (len(got) == 1 && got[0] != tt.want[0]) {
				t.Fatalf("incidents = %#v, want %#v", got, tt.want)
			}
		})
	}
}

// TestRecordIncidentWithoutBridgeDBIsANoOp asserts an app with no bridge
// database neither panics nor logs when a trigger fires.
func TestRecordIncidentWithoutBridgeDBIsANoOp(t *testing.T) {
	t.Parallel()
	logger := &incidentTestLogger{}
	app := &App{sharedLogger: logger.fanout()}

	app.recordEventIncident(eventlog.EventRecord{Domain: "downloads", Level: sharedlogger.LevelError})

	if len(logger.entries) != 0 {
		t.Fatalf("expected no log without a bridge database, got %#v", logger.entries)
	}
}

// TestIngestSyncDiagnosticsRecordsMobileIncident asserts the ingestion seam
// records an incident for a stored failed cycle report.
func TestIngestSyncDiagnosticsRecordsMobileIncident(t *testing.T) {
	t.Parallel()
	app := newIncidentTestApp(t)
	event := mobileTestEvent(t, telemetry.KindCycleReport, "cycle-ingest", syncdiag.Record{
		CycleID: "cycle-ingest", RecentEvents: []syncdiag.RecentEvent{},
		PreviousCycle: &syncdiag.PreviousCycle{Outcome: "failed", ErrorCause: &incidentTestCause},
	})

	if _, err := app.ingestSyncDiagnostics()(context.Background(), event); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	want := incidentRow{reason: "mobile_failure", sourceKind: "mobile", sourceID: "cycle-ingest"}
	if got := readIncidentRows(t, app.bridgeDB); len(got) != 1 || got[0] != want {
		t.Fatalf("incidents = %#v, want %#v", got, want)
	}
}
