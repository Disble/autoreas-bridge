package requestcapture

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

type telemetryRow struct {
	duration        sql.NullInt64
	requestBody     sql.NullString
	requestState    sql.NullString
	responseBody    sql.NullString
	responseState   sql.NullString
	requestHeaders  sql.NullString
	responseHeaders sql.NullString
}

type captureExpectation struct {
	outcome        string
	httpStatus     int
	durationMS     int64
	requestBody    string
	requestState   string
	responseBody   string
	responseState  string
	requestHeader  headerExpectation
	responseHeader headerExpectation
}

type headerExpectation struct {
	key   string
	value string
}

// readTelemetryRow loads persisted telemetry columns for one capture.
func readTelemetryRow(t *testing.T, db *sql.DB, requestID string) telemetryRow {
	t.Helper()

	var row telemetryRow
	err := db.QueryRow(`
		SELECT duration_ms, request_body, request_body_state, response_body, response_body_state, request_headers, response_headers
		FROM request_captures WHERE request_id = ?
	`, requestID).Scan(&row.duration, &row.requestBody, &row.requestState, &row.responseBody, &row.responseState, &row.requestHeaders, &row.responseHeaders)
	if err != nil {
		t.Fatalf("read telemetry columns: %v", err)
	}
	return row
}

// assertTelemetryRow compares persisted telemetry with the expected values.
func assertTelemetryRow(t *testing.T, row, want telemetryRow) {
	t.Helper()

	assertNullableInt64(t, "duration_ms", row.duration, want.duration)
	assertNullableString(t, "request_body", row.requestBody, want.requestBody)
	assertNullableString(t, "request_body_state", row.requestState, want.requestState)
	assertNullableString(t, "response_body", row.responseBody, want.responseBody)
	assertNullableString(t, "response_body_state", row.responseState, want.responseState)
	assertHeaderJSONContains(t, "request_headers", row.requestHeaders, want.requestHeaders)
	assertHeaderJSONContains(t, "response_headers", row.responseHeaders, want.responseHeaders)
}

// assertNullableInt64 compares nullable integer values with useful test output.
func assertNullableInt64(t *testing.T, name string, got, want sql.NullInt64) {
	t.Helper()
	if got.Valid != want.Valid || (got.Valid && got.Int64 != want.Int64) {
		t.Fatalf("expected %s %#v, got %#v", name, want, got)
	}
}

// assertNullableString compares nullable string values with useful test output.
func assertNullableString(t *testing.T, name string, got, want sql.NullString) {
	t.Helper()
	if got.Valid != want.Valid || (got.Valid && got.String != want.String) {
		t.Fatalf("expected %s %#v, got %#v", name, want, got)
	}
}

// assertHeaderJSONContains verifies the expected header fragment was persisted.
func assertHeaderJSONContains(t *testing.T, name string, got, want sql.NullString) {
	t.Helper()
	if got.Valid != want.Valid {
		t.Fatalf("expected %s validity %t, got %#v", name, want.Valid, got)
	}
	if want.Valid && !strings.Contains(got.String, want.String) {
		t.Fatalf("expected %s to contain %q, got %#v", name, want.String, got)
	}
}

// fetchCaptureDetail loads one persisted capture and requires it to exist.
func fetchCaptureDetail(t *testing.T, db *sql.DB, requestID string) CaptureRecord {
	t.Helper()

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), requestID)
	if err != nil {
		t.Fatalf("get final capture: %v", err)
	}
	if !result.Found {
		t.Fatal("expected capture row to remain present")
	}
	return result.Item
}

// assertCaptureDetail compares terminal capture data with its expected state.
func assertCaptureDetail(t *testing.T, got CaptureRecord, want captureExpectation) {
	t.Helper()

	if got.Outcome != want.outcome {
		t.Fatalf("expected final outcome %q, got %#v", want.outcome, got)
	}
	if got.HTTPStatus == nil || *got.HTTPStatus != want.httpStatus {
		t.Fatalf("expected final status %d, got %#v", want.httpStatus, got.HTTPStatus)
	}
	if got.DurationMS == nil || *got.DurationMS != want.durationMS {
		t.Fatalf("expected final duration %d, got %#v", want.durationMS, got.DurationMS)
	}
	if got.RequestBody == nil || *got.RequestBody != want.requestBody {
		t.Fatalf("expected final request body %q, got %#v", want.requestBody, got.RequestBody)
	}
	if got.RequestBodyState != want.requestState {
		t.Fatalf("expected final request body state %q, got %q", want.requestState, got.RequestBodyState)
	}
	if got.ResponseBody == nil || *got.ResponseBody != want.responseBody {
		t.Fatalf("expected final response body %q, got %#v", want.responseBody, got.ResponseBody)
	}
	if got.ResponseBodyState != want.responseState {
		t.Fatalf("expected final response body state %q, got %q", want.responseState, got.ResponseBodyState)
	}
	if got.RequestHeaders[want.requestHeader.key] != want.requestHeader.value {
		t.Fatalf("expected final request headers preserved, got %#v", got.RequestHeaders)
	}
	if got.ResponseHeaders[want.responseHeader.key] != want.responseHeader.value {
		t.Fatalf("expected final response headers preserved, got %#v", got.ResponseHeaders)
	}
}

// openCaptureTestDB creates a temporary initialized bridge database for store tests.
func openCaptureTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(captureDBPath(t))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// requestID returns a deterministic request ID for the given index.
func requestID(index int) string { return "req-" + string(rune('0'+index)) }

// readCaptureIDs returns all request IDs from the captures table ordered by captured_at_ms.
func readCaptureIDs(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`SELECT request_id FROM request_captures ORDER BY captured_at_ms ASC`)
	if err != nil {
		t.Fatalf("query request ids: %v", err)
	}
	defer func() { _ = rows.Close() }()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan request id: %v", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate request ids: %v", err)
	}
	return ids
}

// countRows returns the number of rows in the provided table.
func countRows(t *testing.T, db *sql.DB, table string) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err != nil {
		t.Fatalf("count rows for %s: %v", table, err)
	}
	return count
}

// captureDBPath returns a temporary bridge database path for capture tests.
func captureDBPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "bridge.db")
}
