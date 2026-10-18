package desktop

import (
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/observability/requestcapture"
	bridgeSync "autoreas-bridge/internal/sync"
)

// captureAppTestDB opens a real bridge schema in a temp file so
// requestcapture.NewReader can probe pragma_table_info against it, mirroring
// internal/observability/requestcapture's own test fixtures.
func captureAppTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// seedCaptureRow inserts one minimal capture row for the given request id.
func seedCaptureRow(t *testing.T, db *sql.DB, requestID string, capturedAtMS int64) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code
		) VALUES (?, ?, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted',
			'anime-1', 200, '{"status":1}', '{"operation_refs":[]}', '')
	`, requestID, capturedAtMS)
	if err != nil {
		t.Fatalf("seed capture row %s: %v", requestID, err)
	}
}

// TestGetActivityRequestMapsTheStoredDetail asserts that the detail DTO carries
// the stored row, payload, exact bodies and body states.
func TestGetActivityRequestMapsTheStoredDetail(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)
	requestBody := `{"name":"x","nested":{"n":1},"secret":"keep-me"}`
	if _, err := db.Exec(`UPDATE request_captures SET request_body = ?, request_body_state = ?, response_body_state = ? WHERE request_id = ?`, requestBody, requestcapture.CaptureStateOmittedTooLarge, requestcapture.CaptureStateTruncated, "req-1"); err != nil {
		t.Fatalf("seed request body: %v", err)
	}

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	result, err := app.GetActivityRequest("req-1")
	if err != nil || !result.Found {
		t.Fatalf("GetActivityRequest = %#v, %v; want found", result, err)
	}
	detail := result.Detail
	if detail.RequestID != "req-1" || detail.Kind != "patch" || detail.DeviceID != "device-1" || detail.DeviceName != "Phone" {
		t.Fatalf("unexpected row fields: %#v", detail)
	}
	if detail.HTTPStatus == nil || *detail.HTTPStatus != 200 {
		t.Fatalf("expected http status 200, got %#v", detail.HTTPStatus)
	}
	if detail.Payload == nil {
		t.Fatal("expected a non-nil Payload map")
	}
	if detail.RequestBody == nil || *detail.RequestBody != requestBody {
		t.Fatalf("expected exact request body %q, got %#v", requestBody, detail.RequestBody)
	}
	if detail.RequestBodyState != requestcapture.CaptureStateOmittedTooLarge {
		t.Fatalf("expected request body state to round-trip, got %q", detail.RequestBodyState)
	}
	if detail.ResponseBodyState != requestcapture.CaptureStateTruncated {
		t.Fatalf("expected response body state to round-trip, got %q", detail.ResponseBodyState)
	}
}

// TestToCaptureCorrelationsCopiesEveryReference asserts that each correlation
// list reaches the contracts mirror.
func TestToCaptureCorrelationsCopiesEveryReference(t *testing.T) {
	t.Parallel()
	got := toCaptureCorrelations(requestcapture.Correlations{
		ChangelogIDs:  []int64{7},
		OperationRefs: []requestcapture.OperationRef{{AnimeID: "anime-1", Operation: "patch", Outcome: "applied"}},
		ConflictIDs:   []string{"conflict-8"},
		ActivityIDs:   []int64{9},
	})
	if len(got.ChangelogIDs) != 1 || got.ChangelogIDs[0] != 7 || len(got.ConflictIDs) != 1 || got.ConflictIDs[0] != "conflict-8" || len(got.ActivityIDs) != 1 || got.ActivityIDs[0] != 9 {
		t.Fatalf("unexpected id lists: %#v", got)
	}
	if len(got.OperationRefs) != 1 || got.OperationRefs[0].AnimeID != "anime-1" || got.OperationRefs[0].Operation != "patch" || got.OperationRefs[0].Outcome != "applied" {
		t.Fatalf("unexpected operation refs: %#v", got.OperationRefs)
	}
}

// TestConfigureCaptureReaderIsNilSafeAndBuildsOnce asserts the reader is built
// once from the bridge database.
func TestConfigureCaptureReaderIsNilSafeAndBuildsOnce(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	app := &App{bridgeDB: db, newCaptureReader: requestcapture.NewReader}

	app.configureCaptureReader()
	if app.captureReader == nil {
		t.Fatal("expected configureCaptureReader to build a reader when bridgeDB is set")
	}
	first := app.captureReader
	app.configureCaptureReader()
	if app.captureReader != first {
		t.Fatal("expected configureCaptureReader to be a no-op once a reader already exists")
	}
}

// TestConfigureCaptureReaderNoopWhenBridgeDBNil asserts no reader without a
// bridge database.
func TestConfigureCaptureReaderNoopWhenBridgeDBNil(t *testing.T) {
	t.Parallel()
	app := &App{}
	app.configureCaptureReader()
	if app.captureReader != nil {
		t.Fatal("expected configureCaptureReader to stay nil when bridgeDB is nil")
	}
}

// countCaptureRows reports how many rows the captures table holds, so a
// read path can be proven not to have written anything.
func countCaptureRows(t *testing.T, db *sql.DB) int {
	t.Helper()
	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM request_captures`).Scan(&total); err != nil {
		t.Fatalf("count capture rows: %v", err)
	}

	return total
}
