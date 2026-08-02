package main

import (
	"database/sql"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// seedPendingCaptureRow inserts the transport-only arrival shape the capture
// middleware writes before a handler runs: outcome 'pending' with no
// http_status and no duration_ms. A row left in this state is an orphan from a
// process that died before its terminal write landed.
func seedPendingCaptureRow(t *testing.T, db *sql.DB, requestID string, capturedAtMS int64) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code
		) VALUES (?, ?, 'get', '/api/seasons/active', 'http', '', '', 'pending',
			NULL, NULL, '{}', '{"operation_refs":[]}', '')
	`, requestID, capturedAtMS)
	if err != nil {
		t.Fatalf("seed pending capture row %s: %v", requestID, err)
	}
}

// readCaptureOutcome reads one capture row's persisted outcome.
func readCaptureOutcome(t *testing.T, db *sql.DB, requestID string) string {
	t.Helper()
	var outcome string
	if err := db.QueryRow(`SELECT outcome FROM request_captures WHERE request_id = ?`, requestID).Scan(&outcome); err != nil {
		t.Fatalf("read outcome for %s: %v", requestID, err)
	}
	return outcome
}

func TestSweepOrphanedCapturesClosesArrivalRowsFromAPreviousProcess(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedPendingCaptureRow(t, db, "req-orphan", 100)
	seedCaptureRow(t, db, "req-terminal", 200)

	app := &App{bridgeDB: db}
	app.sweepOrphanedCaptures()

	if got := readCaptureOutcome(t, db, "req-orphan"); got != "abandoned" {
		t.Fatalf("expected the orphaned arrival to be swept to abandoned, got %q", got)
	}
	if got := readCaptureOutcome(t, db, "req-terminal"); got != "accepted" {
		t.Fatalf("expected the terminal row to survive untouched, got %q", got)
	}
}

// sweepTestLogger builds a real shared logger backed by an in-memory sink so a
// test can assert on the warnings a startup step did (or did not) emit.
func sweepTestLogger() (*sharedlogger.FanoutLogger, *sharedlogger.MemLogger) {
	mem := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	return sharedlogger.NewFanoutLogger(mem), mem
}

// warnMessages returns the messages the in-memory sink recorded at warn level.
func warnMessages(mem *sharedlogger.MemLogger) []string {
	messages := []string{}
	for _, entry := range mem.Recent() {
		if entry.Level == sharedlogger.LevelWarn {
			messages = append(messages, entry.Message)
		}
	}
	return messages
}

func TestSweepOrphanedCapturesStaysSilentWithoutBridgeDB(t *testing.T) {
	t.Parallel()
	shared, mem := sweepTestLogger()
	app := &App{sharedLogger: shared}

	app.sweepOrphanedCaptures()

	if warnings := warnMessages(mem); len(warnings) != 0 {
		t.Fatalf("expected no warning when capture persistence is simply not configured, got %#v", warnings)
	}
}

func TestSweepOrphanedCapturesReportsSweptOrphanCount(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedPendingCaptureRow(t, db, "req-orphan", 100)
	shared, mem := sweepTestLogger()
	app := &App{bridgeDB: db, sharedLogger: shared}

	app.sweepOrphanedCaptures()

	warnings := warnMessages(mem)
	if len(warnings) != 1 || !strings.Contains(warnings[0], "swept 1 orphaned capture row") {
		t.Fatalf("expected the swept-orphan count to be reported once, got %#v", warnings)
	}
}

// Some startup tests wire a bare, unopened &sql.DB{} that panics on any query
// rather than returning an error (the same hazard readEventPersistDebugSetting
// documents). A best-effort observability sweep must never take startup down
// with it.
func TestSweepOrphanedCapturesSurvivesAnUnusableBridgeDB(t *testing.T) {
	t.Parallel()
	shared, mem := sweepTestLogger()
	app := &App{bridgeDB: &sql.DB{}, sharedLogger: shared}

	app.sweepOrphanedCaptures()

	if warnings := warnMessages(mem); len(warnings) != 1 || !strings.Contains(warnings[0], "sweep orphaned capture rows") {
		t.Fatalf("expected one warning about the failed sweep, got %#v", warnings)
	}
}

func TestSweepOrphanedCapturesStaysSilentWhenNothingWasOrphaned(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-terminal", 200)
	shared, mem := sweepTestLogger()
	app := &App{bridgeDB: db, sharedLogger: shared}

	app.sweepOrphanedCaptures()

	if warnings := warnMessages(mem); len(warnings) != 0 {
		t.Fatalf("expected an ordinary clean startup to log nothing, got %#v", warnings)
	}
}
