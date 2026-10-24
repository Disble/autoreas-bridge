package activityread

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/activity"
	bridgesync "autoreas-bridge/internal/sync"
)

// testNow is the fixed clock every test reads: 2026-10-17 18:00:00 UTC.
var testNow = time.Date(2026, 10, 17, 18, 0, 0, 0, time.UTC)

// minutesAgo returns the epoch milliseconds n minutes before testNow.
func minutesAgo(n int) int64 {
	return testNow.Add(-time.Duration(n) * time.Minute).UnixMilli()
}

// openTestReader bootstraps a fresh bridge database through the real
// bootstrap and returns it with a Reader over it.
func openTestReader(t *testing.T) (*sql.DB, *Reader) {
	t.Helper()
	db, err := bridgesync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, New(db)
}

// exec runs one statement and fails the test on error.
func exec(t *testing.T, db *sql.DB, statement string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), statement, args...); err != nil {
		t.Fatalf("exec %q: %v", statement, err)
	}
}

// capture is one request_captures row as the recorder stores it.
type capture struct {
	id, kind, route, deviceID, outcome, errorCode, errorMessage string
	atMS                                                        int64
	status                                                      any
	durationMS                                                  any
}

// insertCapture stores c with the transport its kind implies.
func insertCapture(t *testing.T, db *sql.DB, c capture) {
	t.Helper()
	transport := "http"
	if len(c.kind) > 3 && c.kind[:3] == "ws_" {
		transport = "websocket"
	}
	if c.outcome == "" {
		c.outcome = "completed"
	}
	exec(t, db, `INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id,
		device_name, outcome, http_status, payload_json, correlation_json, error_code, error_message, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, 'SM-X800', ?, ?, '{}', '{}', ?, ?, ?)`,
		c.id, c.atMS, c.kind, c.route, transport, c.deviceID, c.outcome, c.status, c.errorCode, c.errorMessage, c.durationMS)
}

// event is one runtime_events row.
type event struct {
	atMS                                                                 int64
	domain, level, message, correlationID, eventType, metadata, entityID string
}

// insertEvent stores e and returns its id.
func insertEvent(t *testing.T, db *sql.DB, e event) int64 {
	t.Helper()
	result, err := db.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, correlation_id,
		event_type, metadata_json, entity_id) VALUES (?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''))`,
		e.atMS, e.domain, e.level, e.message, e.correlationID, e.eventType, e.metadata, e.entityID)
	if err != nil {
		t.Fatalf("insert event: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("event id: %v", err)
	}
	return id
}

// insertIncident stores one occurrence with the standard window and returns its id.
func insertIncident(t *testing.T, db *sql.DB, fingerprint, reason string, atMS int64, sourceKind, sourceID string) int64 {
	t.Helper()
	result, err := db.Exec(`INSERT INTO incidents (fingerprint, reason, occurred_at_ms, window_start_ms,
		window_end_ms, source_kind, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		fingerprint, reason, atMS, atMS-2*60*1000, atMS+30*1000, sourceKind, sourceID)
	if err != nil {
		t.Fatalf("insert incident: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("incident id: %v", err)
	}
	return id
}

// insertRollup stores one hourly rollup bucket.
func insertRollup(t *testing.T, db *sql.DB, hourMS int64, route string, statusClass int, count int64) {
	t.Helper()
	exec(t, db, `INSERT INTO request_rollup_hourly (hour_ms, route_template, status_class, device_id,
		request_count, max_duration_ms) VALUES (?, ?, ?, 'device-1', ?, 40)`, hourMS, route, statusClass, count)
}

// insertTelemetry stores one episode_action mobile report.
func insertTelemetry(t *testing.T, db *sql.DB, eventID string, reportedMS, observedMS int64, payload string) {
	t.Helper()
	insertTelemetryOfKind(t, db, "episode_action", eventID, reportedMS, observedMS, payload)
}

// insertTelemetryOfKind stores one mobile report of the given kind.
func insertTelemetryOfKind(t *testing.T, db *sql.DB, kind, eventID string, reportedMS, observedMS int64, payload string) {
	t.Helper()
	exec(t, db, `INSERT INTO device_telemetry_events (device_id, reported_at_ms, kind, event_id, observed_at_ms,
		payload_json) VALUES ('device-1', ?, ?, ?, ?, ?)`, reportedMS, kind, eventID, observedMS, payload)
}

// insertChange records one domain history change through internal/activity,
// the table's owner; reportedMS 0 means the change reported no time.
func insertChange(t *testing.T, db *sql.DB, source, animeName string, atMS, reportedMS int64) {
	t.Helper()
	err := activity.NewStore(activity.NewSQLiteProvider(db)).RecordActivity(context.Background(), activity.Record{
		Source: source, ActionType: "episode_adjusted", AnimeID: "anime-1", AnimeName: animeName, OccurredAtMs: atMS,
		CorrelationID: "anime.patch:anime-1", ReportedAtMS: reportedMS,
		BeforeJSON: []byte(`{"Estado":0,"NroCapVisto":10,"Activo":1}`), AfterJSON: []byte(`{"Estado":0,"NroCapVisto":11,"Activo":1}`),
	})
	if err != nil {
		t.Fatalf("record change: %v", err)
	}
}

// insertSeasonGrade records one season grade change from source through
// internal/activity, the table's owner.
func insertSeasonGrade(t *testing.T, db *sql.DB, source string, atMS int64) {
	t.Helper()
	err := activity.NewStore(activity.NewSQLiteProvider(db)).RecordActivity(context.Background(), activity.Record{
		Source: source, ActionType: activity.ActionSeasonGradeSet, AnimeID: "anime-2", AnimeName: "Date A Live V", OccurredAtMs: atMS,
		CorrelationID: "season.grade:anime-2", BeforeJSON: []byte(`{"grade":4}`), AfterJSON: []byte(`{"grade":5}`),
	})
	if err != nil {
		t.Fatalf("record season grade: %v", err)
	}
}
