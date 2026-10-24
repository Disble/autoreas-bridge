package desktop

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/observability/incident"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/retention"
)

// activityTestNow is 00:30 local time, so local midnight is 30 minutes back
// and yesterday's facts sit right before it.
var activityTestNow = time.Date(2026, 10, 17, 0, 30, 0, 0, time.Local)

// newActivityTestApp returns an app over a bootstrapped bridge database whose
// clock reads activityTestNow and whose process started 10 minutes earlier.
func newActivityTestApp(t *testing.T) *App {
	t.Helper()
	app := &App{
		bridgeDB:         captureAppTestDB(t),
		nowTime:          func() time.Time { return activityTestNow },
		processStartedAt: activityTestNow.Add(-10 * time.Minute),
	}
	app.ensureCaptureRuntimeDependencies()
	app.configureCaptureReader()
	return app
}

// activityAt returns activityTestNow shifted by offset, in epoch milliseconds.
func activityAt(offset time.Duration) int64 {
	return activityTestNow.Add(offset).UnixMilli()
}

// seedActivityIncident records one incident occurrence and returns nothing:
// tests read ids back through the list.
func seedActivityIncident(t *testing.T, db *sql.DB, trigger incident.Trigger, atMS int64, kind incident.SourceKind, sourceID string) {
	t.Helper()
	err := incident.NewStore(db).Record(context.Background(), incident.Occurrence{
		Trigger: trigger, OccurredAt: time.UnixMilli(atMS), SourceKind: kind, SourceID: sourceID,
	})
	if err != nil {
		t.Fatalf("record incident: %v", err)
	}
}

// seedActivityEvent inserts one runtime event.
func seedActivityEvent(t *testing.T, db *sql.DB, atMS int64, domain, level, correlationID string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, correlation_id, event_type)
		VALUES (?, ?, ?, 'step', NULLIF(?, ''), 'test.step')`, atMS, domain, level, correlationID); err != nil {
		t.Fatalf("insert event: %v", err)
	}
}

// TestGetActivityIncidentReportsFoundAndNotFound asserts a stored occurrence
// is found with its detail and a missing one is a typed not-found, not an error.
func TestGetActivityIncidentReportsFoundAndNotFound(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityIncident(t, app.bridgeDB, incident.Trigger{Reason: incident.ReasonServerError, Fingerprint: "server_error|patch"},
		activityAt(-time.Hour), incident.SourceRequest, "req-1")
	ids := queryActivityColumn[int64](t, app.bridgeDB, `SELECT id FROM incidents`)
	if len(ids) != 1 {
		t.Fatalf("incident ids = %v, want one", ids)
	}

	found, err := app.GetActivityIncident(ids[0])
	if err != nil || !found.Found || found.Detail.Incident.SourceID != "req-1" {
		t.Fatalf("GetActivityIncident(existing) = %#v, %v", found, err)
	}
	missing, err := app.GetActivityIncident(ids[0] + 100)
	if err != nil || missing.Found {
		t.Fatalf("GetActivityIncident(missing) = %#v, %v; want not found and no error", missing, err)
	}
}

// TestGetActivityRunStoryReturnsTheStepsOfItsCorrelationID asserts a run
// story returns the steps of its correlation id and no other run's.
func TestGetActivityRunStoryReturnsTheStepsOfItsCorrelationID(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityEvent(t, app.bridgeDB, activityAt(-4*time.Minute), "download", "warn", "run-recovered")
	seedActivityEvent(t, app.bridgeDB, activityAt(-3*time.Minute), "download", "info", "run-download")
	seedActivityEvent(t, app.bridgeDB, activityAt(-2*time.Minute), "download", "error", "run-download")
	seedActivityEvent(t, app.bridgeDB, activityAt(-time.Minute), "schedule", "info", "run-schedule")

	story, err := app.GetActivityRunStory("run-download")
	if err != nil || len(story.Steps) != 2 || story.Steps[1].Level != "error" {
		t.Fatalf("GetActivityRunStory = %#v, %v", story, err)
	}
}

// TestGetActivityRequestRedactsCredentialsAndReportsNotFound asserts one
// capture is returned with its bodies, a stored credential header never
// reaches the UI, and a missing capture is a typed not-found.
func TestGetActivityRequestRedactsCredentialsAndReportsNotFound(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	record := requestcapture.BuildTransportCaptureRecord("req-secret", activityAt(-time.Minute), "patch", "/api/animes/a1", "http")
	body := `{"status":1}`
	record.RequestBody = &body
	record.RequestHeaders = map[string]string{"Authorization": "Bearer secret-token", "X-Trace": "t-1"}
	record.ResponseHeaders = map[string]string{"Proxy-Authorization": "Basic secret"}
	if err := requestcapture.NewStore(app.bridgeDB).UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("store capture: %v", err)
	}

	got, err := app.GetActivityRequest("req-secret")
	if err != nil || !got.Found || got.Detail.RequestBody == nil || *got.Detail.RequestBody != body {
		t.Fatalf("GetActivityRequest = %#v, %v", got, err)
	}
	if got.Detail.RequestHeaders["Authorization"] != requestcapture.RedactedHeaderPlaceholder ||
		got.Detail.RequestHeaders["X-Trace"] != "t-1" ||
		got.Detail.ResponseHeaders["Proxy-Authorization"] != requestcapture.RedactedHeaderPlaceholder {
		t.Fatalf("headers = %#v / %#v; want credentials redacted, others kept", got.Detail.RequestHeaders, got.Detail.ResponseHeaders)
	}
	missing, err := app.GetActivityRequest("req-missing")
	if err != nil || missing.Found {
		t.Fatalf("GetActivityRequest(missing) = %#v, %v; want not found and no error", missing, err)
	}
}

// TestPinActivityMomentRecordsOneManualPinPerCall asserts each pin stores one
// manual_pin incident at the app's clock with its own fingerprint.
func TestPinActivityMomentRecordsOneManualPinPerCall(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)

	if err := app.PinActivityMoment(); err != nil {
		t.Fatalf("first pin: %v", err)
	}
	app.nowTime = func() time.Time { return activityTestNow.Add(time.Second) }
	if err := app.PinActivityMoment(); err != nil {
		t.Fatalf("second pin: %v", err)
	}

	rows, err := app.bridgeDB.Query(`SELECT fingerprint, reason, occurred_at_ms, source_kind, source_id FROM incidents ORDER BY id`)
	if err != nil {
		t.Fatalf("query incidents: %v", err)
	}
	defer func() { _ = rows.Close() }()
	fingerprints := map[string]bool{}
	var count int
	for rows.Next() {
		var fingerprint, reason, sourceKind, sourceID string
		var atMS int64
		if err := rows.Scan(&fingerprint, &reason, &atMS, &sourceKind, &sourceID); err != nil {
			t.Fatalf("scan incident: %v", err)
		}
		want := activityAt(time.Duration(count) * time.Second)
		if reason != string(incident.ReasonManualPin) || atMS != want || sourceKind != string(activityPinSourceKind) || sourceID == "" {
			t.Fatalf("pin %d = %q %q %d %q %q; want manual_pin at %d", count, fingerprint, reason, atMS, sourceKind, sourceID, want)
		}
		fingerprints[fingerprint] = true
		count++
	}
	if count != 2 || len(fingerprints) != 2 {
		t.Fatalf("expected two pins with distinct fingerprints, got %d rows and %v", count, fingerprints)
	}
}

// TestActivityBindingsReportAnUnwiredDatabase asserts every read fails with
// errActivityUnavailable before the bridge database is wired.
func TestActivityBindingsReportAnUnwiredDatabase(t *testing.T) {
	t.Parallel()
	app := &App{}
	calls := map[string]func() error{
		"incident": func() error { _, err := app.GetActivityIncident(1); return err },
		"story":    func() error { _, err := app.GetActivityRunStory("run"); return err },
		"request":  func() error { _, err := app.GetActivityRequest("req"); return err },
		"pin":      app.PinActivityMoment,
	}
	for name, call := range calls {
		if err := call(); !errors.Is(err, errActivityUnavailable) {
			t.Fatalf("%s: err = %v, want errActivityUnavailable", name, err)
		}
	}
}

// TestPinActivityMomentKeepsTheRecorderWindowThroughTheSweep asserts a pin
// keeps the recorder rows from 2 minutes before to 30 seconds after it once
// the 2-hour recorder span has passed, and lets the rows outside it go.
func TestPinActivityMomentKeepsTheRecorderWindowThroughTheSweep(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	captures := map[string]time.Duration{
		"get-before-window": -2*time.Minute - time.Second, "get-window-start": -2 * time.Minute,
		"get-window-end": 30 * time.Second, "get-after-window": 31 * time.Second,
	}
	for requestID, offset := range captures {
		if _, err := app.bridgeDB.Exec(`INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport,
			device_id, device_name, outcome, payload_json, correlation_json, error_code)
			VALUES (?, ?, 'get', '/api/animes', 'http', 'device-1', 'Phone', 'completed', '{}', '{}', '')`,
			requestID, activityAt(offset)); err != nil {
			t.Fatalf("seed capture %s: %v", requestID, err)
		}
	}
	if _, err := app.bridgeDB.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, event_type)
		VALUES (?, 'sync', 'info', 'poll', 'sync.reconcile'), (?, 'sync', 'info', 'poll', 'sync.reconcile')`,
		activityAt(-time.Minute), activityAt(-3*time.Minute)); err != nil {
		t.Fatalf("seed events: %v", err)
	}

	if err := app.PinActivityMoment(); err != nil {
		t.Fatalf("pin: %v", err)
	}
	if _, err := retention.Sweep(context.Background(), app.bridgeDB, activityTestNow.Add(3*time.Hour)); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	kept := queryActivityColumn[string](t, app.bridgeDB, `SELECT request_id FROM request_captures ORDER BY captured_at_ms`)
	if want := []string{"get-window-start", "get-window-end"}; !reflect.DeepEqual(kept, want) {
		t.Fatalf("captures kept after the sweep = %v, want %v", kept, want)
	}
	events := queryActivityColumn[int64](t, app.bridgeDB, `SELECT occurred_at_ms FROM runtime_events`)
	if want := []int64{activityAt(-time.Minute)}; !reflect.DeepEqual(events, want) {
		t.Fatalf("events kept after the sweep = %v, want %v", events, want)
	}
}

// queryActivityColumn returns the single column of every row a query returns.
func queryActivityColumn[T any](t *testing.T, db *sql.DB, query string) []T {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatalf("query %q: %v", query, err)
	}
	defer func() { _ = rows.Close() }()
	var values []T
	for rows.Next() {
		var value T
		if err := rows.Scan(&value); err != nil {
			t.Fatalf("scan %q: %v", query, err)
		}
		values = append(values, value)
	}
	return values
}
