package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/telemetry"
)

// storedTelemetryRow is the envelope and payload of one stored row.
type storedTelemetryRow struct {
	DeviceID     string
	EventID      string
	ObservedAtMS sql.NullInt64
	Payload      string
}

// newStoreBackedDiagnosticsHandler wires the endpoint to a real store over a
// temporary SQLite file with the default kind vocabulary.
func newStoreBackedDiagnosticsHandler(t *testing.T) (http.Handler, *sql.DB) {
	t.Helper()
	db := openTelemetryEventsTestDB(t)
	registry := telemetry.DefaultRegistry()
	store := telemetry.NewStore(db, telemetry.StoreConfig{Registry: registry})
	stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1"}
	return NewSyncDiagnosticsHandler(SyncDiagnosticsConfig{Authenticate: stubs.authenticate, Ingest: store.Insert, Kinds: registry}), db
}

// readStoredRows returns every stored row of one kind, oldest first.
func readStoredRows(t *testing.T, db *sql.DB, kind telemetry.KindName) []storedTelemetryRow {
	t.Helper()
	rows, err := db.Query(`SELECT device_id, event_id, observed_at_ms, payload_json FROM device_telemetry_events WHERE kind = ? ORDER BY rowid`, kind)
	if err != nil {
		t.Fatalf("query %s rows: %v", kind, err)
	}
	defer func() { _ = rows.Close() }()
	var stored []storedTelemetryRow
	for rows.Next() {
		var row storedTelemetryRow
		if err := rows.Scan(&row.DeviceID, &row.EventID, &row.ObservedAtMS, &row.Payload); err != nil {
			t.Fatalf("scan %s row: %v", kind, err)
		}
		stored = append(stored, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate %s rows: %v", kind, err)
	}
	return stored
}

// TestSyncDiagnosticsStoresEachMobileReportKindOnce posts each new kind twice
// through the endpoint into a real store: both posts answer 204, one row is
// stored with the token's device, the observation id as event id and the
// kind's observed time, and a repost with different counts does not replace
// it -- the first write wins.
func TestSyncDiagnosticsStoresEachMobileReportKindOnce(t *testing.T) {
	t.Parallel()

	tests := []struct {
		kind       telemetry.KindName
		body       string
		repost     string
		eventID    string
		observedAt int64
		payload    string
	}{
		{
			kind:       telemetry.KindHourlySummary,
			body:       `{"kind":"hourly_summary","observation_id":"inst-1:2026-11-07T10","hour_start_ms":1794135600000,"counts":[{"trigger_source":"foreground_service","outcome":"closed","count":31,"max_duration_ms":1412}],"dropped_count":0,"process_deaths":[{"process_name":"sync","reason":"low_memory","count":1}]}`,
			repost:     `{"kind":"hourly_summary","observation_id":"inst-1:2026-11-07T10","hour_start_ms":1794135600000,"counts":[{"trigger_source":"foreground_service","outcome":"closed","count":99}],"dropped_count":5}`,
			eventID:    "inst-1:2026-11-07T10",
			observedAt: 1794135600000,
			payload:    `{"counts":[{"trigger_source":"foreground_service","outcome":"closed","count":31,"max_duration_ms":1412}],"dropped_count":0,"process_deaths":[{"process_name":"sync","reason":"low_memory","count":1}]}`,
		},
		{
			kind:       telemetry.KindRuntimeTransition,
			body:       `{"kind":"runtime_transition","observation_id":"rt-1","observed_at_ms":1794139020000,"process_name":"sync","subject":"process","transition":"died","reason":"low_memory","app_version":"2.7.1"}`,
			repost:     `{"kind":"runtime_transition","observation_id":"rt-1","observed_at_ms":1794139020000,"process_name":"sync","subject":"service","transition":"started","app_version":"2.7.1"}`,
			eventID:    "rt-1",
			observedAt: 1794139020000,
			payload:    `{"process_name":"sync","subject":"process","transition":"died","reason":"low_memory","app_version":"2.7.1"}`,
		},
	}
	for _, tc := range tests {
		t.Run(tc.kind, func(t *testing.T) {
			t.Parallel()
			handler, db := newStoreBackedDiagnosticsHandler(t)
			for _, body := range []string{tc.body, tc.repost} {
				if res := postDiagnostics(t, handler, body); res.Code != http.StatusNoContent {
					t.Fatalf("status = %d, want 204 (body %q)", res.Code, res.Body.String())
				}
			}
			rows := readStoredRows(t, db, tc.kind)
			want := storedTelemetryRow{DeviceID: "dev-1", EventID: tc.eventID, ObservedAtMS: sql.NullInt64{Int64: tc.observedAt, Valid: true}, Payload: tc.payload}
			if len(rows) != 1 || rows[0] != want {
				t.Fatalf("stored rows = %+v, want exactly %+v", rows, want)
			}
		})
	}
}

// TestSyncDiagnosticsRefusesMobileReportKindsWithoutStoring drives each
// refusal class a new kind can earn through the real store: a closed
// vocabulary, an invalid subject and transition pair, the code pattern, a
// missing required key, a body-supplied
// device_id and the 8 KiB limit. Each answers its code and stores nothing.
func TestSyncDiagnosticsRefusesMobileReportKindsWithoutStoring(t *testing.T) {
	t.Parallel()

	hourly := `{"kind":"hourly_summary","observation_id":"i:h","hour_start_ms":0,"counts":[{"trigger_source":"manual","outcome":"closed","count":1}],"dropped_count":0}`
	transition := `{"kind":"runtime_transition","observation_id":"o","observed_at_ms":0,"process_name":"sync","subject":"service","transition":"started","app_version":"2.7.1"}`
	tests := []struct {
		name   string
		kind   telemetry.KindName
		body   string
		status int
		code   string
		field  string
	}{
		{"unknown trigger source", telemetry.KindHourlySummary, strings.Replace(hourly, `"manual"`, `"native_fgs_tick"`, 1), 400, "field_rejected", "counts[0].trigger_source"},
		{"missing dropped count", telemetry.KindHourlySummary, strings.Replace(hourly, `,"dropped_count":0`, ``, 1), 400, "field_rejected", "dropped_count"},
		{"unknown process", telemetry.KindRuntimeTransition, strings.Replace(transition, `"sync"`, `"ui"`, 1), 400, "field_rejected", "process_name"},
		{"unknown subject", telemetry.KindRuntimeTransition, strings.Replace(transition, `"service"`, `"sync_service"`, 1), 400, "field_rejected", "subject"},
		{"invalid subject and transition pair", telemetry.KindRuntimeTransition, strings.Replace(transition, `"started"`, `"armed"`, 1), 400, "field_rejected", "transition"},
		{"missing app version", telemetry.KindRuntimeTransition, strings.Replace(transition, `,"app_version":"2.7.1"`, ``, 1), 400, "field_rejected", "app_version"},
		{"body device id", telemetry.KindRuntimeTransition, strings.Replace(transition, `"o",`, `"o","device_id":"spoofed",`, 1), 400, "field_rejected", "device_id"},
		{"oversize body", telemetry.KindRuntimeTransition, strings.Replace(transition, `"o"`, `"`+strings.Repeat("o", telemetry.MaxBodyBytes)+`"`, 1), 413, "body_too_large", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			handler, db := newStoreBackedDiagnosticsHandler(t)
			res := postDiagnostics(t, handler, tc.body)
			var refusal map[string]string
			if err := json.Unmarshal(res.Body.Bytes(), &refusal); err != nil || res.Code != tc.status || refusal["code"] != tc.code || refusal["field"] != tc.field {
				t.Fatalf("status = %d, body %q; want %d %s naming %q", res.Code, res.Body.String(), tc.status, tc.code, tc.field)
			}
			if got := countStoredKind(t, db, tc.kind); got != 0 {
				t.Fatalf("stored %s rows = %d, want 0", tc.kind, got)
			}
		})
	}
}

// TestSyncDiagnosticsCycleReportNeedsACycleID pins S4 end to end: an empty or
// missing cycle_id is refused as a rejected field and stores nothing, while a
// valid report, with or without the explicit kind, is still stored.
func TestSyncDiagnosticsCycleReportNeedsACycleID(t *testing.T) {
	t.Parallel()

	handler, db := newStoreBackedDiagnosticsHandler(t)
	for name, body := range map[string]string{
		"empty":   strings.Replace(validDiagnosticsBody(), `"cycle_id":"c1"`, `"cycle_id":""`, 1),
		"missing": strings.Replace(validDiagnosticsBody(), `"cycle_id":"c1",`, ``, 1),
	} {
		res := postDiagnostics(t, handler, body)
		var refusal map[string]string
		if err := json.Unmarshal(res.Body.Bytes(), &refusal); err != nil || res.Code != http.StatusBadRequest || refusal["code"] != "field_rejected" || refusal["field"] != "cycle_id" {
			t.Fatalf("%s cycle_id: status = %d, body %q; want 400 field_rejected naming cycle_id", name, res.Code, res.Body.String())
		}
	}
	if got := countStoredKind(t, db, telemetry.KindCycleReport); got != 0 {
		t.Fatalf("stored cycle_report rows = %d, want 0 after two refusals", got)
	}

	native := `{"kind":"cycle_report","cycle_id":"native-1","degraded":null,"trigger_source":"foreground_service","app_state":"background","previous_cycle":{"cycle_id":"native-1","trigger_source":"foreground_service","outcome":"failed","last_stage":"http","error_name":"unknown"},"counters":{"consecutive_unclosed_cycles":0,"pending_ops_count":0,"cursor":0},"recent_events":[]}`
	// hourly_summary counts only 8 schedulers, but a cycle report's previous
	// cycle keeps accepting local_mutation_write: the two lists are separate.
	localWrite := strings.Replace(strings.Replace(native, `"cycle_id":"native-1","degraded"`, `"cycle_id":"native-2","degraded"`, 1),
		`"native-1","trigger_source":"foreground_service","outcome"`, `"native-1","trigger_source":"local_mutation_write","outcome"`, 1)
	for _, body := range []string{validDiagnosticsBody(), native, localWrite} {
		if res := postDiagnostics(t, handler, body); res.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want 204 (body %q)", res.Code, res.Body.String())
		}
	}
	if got := countStoredKind(t, db, telemetry.KindCycleReport); got != 3 {
		t.Fatalf("stored cycle_report rows = %d, want 3", got)
	}
}
