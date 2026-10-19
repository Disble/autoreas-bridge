package retention

import (
	"database/sql"
	"path/filepath"
	"slices"
	"testing"
	"time"

	bridgeSync "autoreas-bridge/internal/sync"
)

// sweepNow is the fixed clock every sweep test runs against.
var sweepNow = time.UnixMilli(1_800_000_000_000)

// recorderCutoffMS is the oldest captured_at_ms the recorder still keeps at sweepNow. It is
// spelled as ADR-028's 2 hours, not RecorderSpan, so the boundary tests pin the span itself.
var recorderCutoffMS = sweepNow.Add(-2 * time.Hour).UnixMilli()

// ledgerCutoffMS is the oldest timestamp the ledger still keeps at sweepNow. It is spelled as
// ADR-028's 90 days, not LedgerSpan, so the boundary tests pin the span itself.
var ledgerCutoffMS = sweepNow.Add(-90 * 24 * time.Hour).UnixMilli()

// openSweepTestDB opens a bridge database through the real bootstrap in a temp dir.
func openSweepTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// testCapture is the subset of a request_captures row the sweep reads.
type testCapture struct {
	id          string
	kind        string
	atMS        int64
	correlation string
}

// insertCapture stores one request_captures row with an empty correlation unless one is given.
func insertCapture(t *testing.T, db *sql.DB, capture testCapture) {
	t.Helper()
	correlation := capture.correlation
	if correlation == "" {
		correlation = `{"operation_refs":[]}`
	}
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES (?, ?, ?, '/api/test', 'http', 'device-1', 'Phone', 'accepted', '{}', ?)`,
		capture.id, capture.atMS, capture.kind, correlation)
	if err != nil {
		t.Fatalf("insert capture %s: %v", capture.id, err)
	}
}

// testEvent is the subset of a runtime_events row the sweep reads.
type testEvent struct {
	message   string
	eventType *string
	atMS      int64
}

// insertEvent stores one runtime_events row; the message doubles as the test's row label.
func insertEvent(t *testing.T, db *sql.DB, event testEvent) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, event_type) VALUES (?, 'sync', 'info', ?, ?)`,
		event.atMS, event.message, event.eventType)
	if err != nil {
		t.Fatalf("insert event %s: %v", event.message, err)
	}
}

// insertIncident stores one incidents row for fingerprint at occurredMS with the given window.
func insertIncident(t *testing.T, db *sql.DB, fingerprint string, occurredMS, windowStartMS, windowEndMS int64) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO incidents (fingerprint, reason, occurred_at_ms, window_start_ms, window_end_ms, source_kind, source_id)
		VALUES (?, 'http_5xx', ?, ?, ?, 'capture', 'req')`, fingerprint, occurredMS, windowStartMS, windowEndMS)
	if err != nil {
		t.Fatalf("insert incident %s: %v", fingerprint, err)
	}
}

// stringColumn returns one TEXT column of table ordered by itself.
func stringColumn(t *testing.T, db *sql.DB, query string) []string {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatalf("query %q: %v", query, err)
	}
	defer func() { _ = rows.Close() }()
	values := []string{}
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			t.Fatalf("scan %q: %v", query, err)
		}
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate %q: %v", query, err)
	}
	slices.Sort(values)
	return values
}

// sweep runs Sweep at sweepNow and fails the test on error.
func sweep(t *testing.T, db *sql.DB) SweepResult {
	t.Helper()
	result, err := Sweep(t.Context(), db, sweepNow)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	return result
}

// assertSurvivors fails unless got equals want, both sorted.
func assertSurvivors(t *testing.T, what string, got, want []string) {
	t.Helper()
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("%s survivors:\n got %q\nwant %q", what, got, want)
	}
}

// eventType returns a pointer to value for a nullable event_type column.
func eventType(value string) *string { return &value }
