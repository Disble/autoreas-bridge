package desktop

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/observability/activityread"
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

// seedActivityChange records one domain history change at atMS.
func seedActivityChange(t *testing.T, db *sql.DB, atMS int64) {
	t.Helper()
	err := activity.NewStore(activity.NewSQLiteProvider(db)).RecordActivity(context.Background(), activity.Record{
		Source: activity.SourceMobile, ActionType: activity.ActionEpisodeAdjusted, AnimeID: "anime-1", AnimeName: "Frieren",
		OccurredAtMs: atMS, BeforeJSON: []byte(`{}`), AfterJSON: []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("record change: %v", err)
	}
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

// TestGetActivityNowReadsTheAppClock asserts Now is answered from the app's
// clock, its local midnight and its process start: a change at midnight
// counts as today and one a millisecond before it does not.
func TestGetActivityNowReadsTheAppClock(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityChange(t, app.bridgeDB, activityAt(-30*time.Minute-time.Millisecond))
	seedActivityChange(t, app.bridgeDB, activityAt(-30*time.Minute))

	got, err := app.GetActivityNow()
	if err != nil {
		t.Fatalf("GetActivityNow: %v", err)
	}

	if got.ChangesToday != 1 || got.UptimeMS != (10*time.Minute).Milliseconds() {
		t.Fatalf("changes today = %d, uptime = %d; want 1 and 600000", got.ChangesToday, got.UptimeMS)
	}
	want, err := activityread.New(app.bridgeDB).Now(context.Background(), activityread.NowInput{
		Now: activityTestNow, LocalMidnight: activityTestNow.Add(-30 * time.Minute), ProcessStartedAt: app.processStartedAt,
	})
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("GetActivityNow = %#v, want %#v (%v)", got, want, err)
	}
}

// TestListActivityIncidentsFiltersByWhere asserts the filter and the clock
// reach the incident list, and an unknown filter is an error.
func TestListActivityIncidentsFiltersByWhere(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityIncident(t, app.bridgeDB, incident.Trigger{Reason: incident.ReasonServerError, Fingerprint: "server_error|patch"},
		activityAt(-time.Hour), incident.SourceRequest, "req-1")
	seedActivityIncident(t, app.bridgeDB, incident.Trigger{Reason: incident.ReasonErrorEvent, Fingerprint: "error_event|download|x"},
		activityAt(-time.Hour), incident.SourceEvent, "")
	seedActivityIncident(t, app.bridgeDB, incident.Trigger{Reason: incident.ReasonServerError, Fingerprint: "server_error|old"},
		activityAt(-8*24*time.Hour), incident.SourceRequest, "req-old")

	for where, want := range map[string][]string{"all": {"server_error|patch", "error_event|download|x"}, "phone": {"server_error|patch"}} {
		got, err := app.ListActivityIncidents(where)
		if err != nil {
			t.Fatalf("ListActivityIncidents(%q): %v", where, err)
		}
		fingerprints := map[string]bool{}
		for _, summary := range got {
			fingerprints[summary.Fingerprint] = true
		}
		if len(got) != len(want) || !fingerprints[want[0]] || !fingerprints[want[len(want)-1]] {
			t.Fatalf("ListActivityIncidents(%q) = %#v, want %v", where, got, want)
		}
	}
	if _, err := app.ListActivityIncidents("bogus"); err == nil {
		t.Fatal("expected an unknown where filter to fail")
	}
}

// TestGetActivityIncidentReportsFoundAndNotFound asserts a stored occurrence
// is found with its detail and a missing one is a typed not-found, not an error.
func TestGetActivityIncidentReportsFoundAndNotFound(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityIncident(t, app.bridgeDB, incident.Trigger{Reason: incident.ReasonServerError, Fingerprint: "server_error|patch"},
		activityAt(-time.Hour), incident.SourceRequest, "req-1")
	list, err := app.ListActivityIncidents("all")
	if err != nil || len(list) != 1 {
		t.Fatalf("list incidents: %#v, %v", list, err)
	}

	found, err := app.GetActivityIncident(list[0].LatestID)
	if err != nil || !found.Found || found.Detail.Incident.SourceID != "req-1" {
		t.Fatalf("GetActivityIncident(existing) = %#v, %v", found, err)
	}
	missing, err := app.GetActivityIncident(list[0].LatestID + 100)
	if err != nil || missing.Found {
		t.Fatalf("GetActivityIncident(missing) = %#v, %v; want not found and no error", missing, err)
	}
}

// TestSearchActivityHistoryPassesItsInputs asserts History is answered for the
// app's clock and the given filter, cursor and limit.
func TestSearchActivityHistoryPassesItsInputs(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityEvent(t, app.bridgeDB, activityAt(-time.Minute), "download", "warn", "")
	seedActivityEvent(t, app.bridgeDB, activityAt(-2*time.Minute), "download", "warn", "")
	seedActivityEvent(t, app.bridgeDB, activityAt(-3*time.Minute), "schedule", "warn", "")

	first, err := app.SearchActivityHistory("downloads", "", 1)
	if err != nil || len(first.Days) != 1 || len(first.Days[0].Lines) != 1 || first.NextCursor == "" || len(first.Calendar) == 0 {
		t.Fatalf("first page = %#v, %v; want one line and a cursor", first, err)
	}
	second, err := app.SearchActivityHistory("downloads", first.NextCursor, 1)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	want, err := activityread.New(app.bridgeDB).History(context.Background(), activityread.HistoryInput{
		Now: activityTestNow, Where: activityread.WhereDownloads, Cursor: first.NextCursor, Limit: 1,
	})
	if err != nil || !reflect.DeepEqual(second, want) || second.NextCursor != "" {
		t.Fatalf("second page = %#v, want %#v and no cursor (%v)", second, want, err)
	}
}

// TestListActivityRunsAndRunStory asserts the run list is filtered by place
// and a run story returns the steps of its correlation id.
func TestListActivityRunsAndRunStory(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityEvent(t, app.bridgeDB, activityAt(-3*time.Minute), "download", "info", "run-download")
	seedActivityEvent(t, app.bridgeDB, activityAt(-2*time.Minute), "download", "error", "run-download")
	seedActivityEvent(t, app.bridgeDB, activityAt(-time.Minute), "schedule", "info", "run-schedule")

	runs, err := app.ListActivityRuns("downloads")
	if err != nil || len(runs) != 1 || runs[0].CorrelationID != "run-download" || runs[0].Outcome != "error" {
		t.Fatalf("ListActivityRuns = %#v, %v", runs, err)
	}
	story, err := app.GetActivityRunStory("run-download")
	if err != nil || len(story.Steps) != 2 || story.Steps[1].Level != "error" {
		t.Fatalf("GetActivityRunStory = %#v, %v", story, err)
	}
}

// TestListActivityRecorderPagesTheLastTwoHours asserts the recorder reads the
// app's clock and honours the cursor and the limit.
func TestListActivityRecorderPagesTheLastTwoHours(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedCaptureRow(t, app.bridgeDB, "req-new", activityAt(-time.Minute))
	seedCaptureRow(t, app.bridgeDB, "req-older", activityAt(-2*time.Minute))
	seedCaptureRow(t, app.bridgeDB, "req-stale", activityAt(-3*time.Hour))

	first, err := app.ListActivityRecorder("", 1)
	if err != nil || len(first.Entries) != 1 || first.Entries[0].ID != "req-new" || first.NextCursor == "" {
		t.Fatalf("first recorder page = %#v, %v", first, err)
	}
	second, err := app.ListActivityRecorder(first.NextCursor, 1)
	if err != nil || len(second.Entries) != 1 || second.Entries[0].ID != "req-older" || second.NextCursor != "" {
		t.Fatalf("second recorder page = %#v, %v", second, err)
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
	if err := requestcapture.NewStore(app.bridgeDB, requestcapture.StoreConfig{}).UpsertCapture(context.Background(), record); err != nil {
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
// manual_pin incident at the app's clock, its own fingerprint, and shows in
// the incident list under All.
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
	if list, err := app.ListActivityIncidents("all"); err != nil || len(list) != 2 {
		t.Fatalf("pins under All = %#v, %v", list, err)
	}
}

// TestActivityBindingsReportAnUnwiredDatabase asserts every read fails with
// errActivityUnavailable before the bridge database is wired.
func TestActivityBindingsReportAnUnwiredDatabase(t *testing.T) {
	t.Parallel()
	app := &App{}
	calls := map[string]func() error{
		"now":       func() error { _, err := app.GetActivityNow(); return err },
		"incidents": func() error { _, err := app.ListActivityIncidents("all"); return err },
		"incident":  func() error { _, err := app.GetActivityIncident(1); return err },
		"history":   func() error { _, err := app.SearchActivityHistory("all", "", 0); return err },
		"runs":      func() error { _, err := app.ListActivityRuns("all"); return err },
		"story":     func() error { _, err := app.GetActivityRunStory("run"); return err },
		"recorder":  func() error { _, err := app.ListActivityRecorder("", 0); return err },
		"request":   func() error { _, err := app.GetActivityRequest("req"); return err },
		"pin":       app.PinActivityMoment,
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
