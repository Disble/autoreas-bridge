package main

import (
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/mobilecapture"
	bridgeSync "autoreas-bridge/internal/sync"
)

// captureAppTestDB opens a real bridge schema in a temp file so
// mobilecapture.NewReader can probe pragma_table_info against it, mirroring
// internal/observability/mobilecapture's own test fixtures.
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
		INSERT INTO mobile_request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code
		) VALUES (?, ?, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted',
			'anime-1', 200, '{"status":1}', '{"operation_refs":[]}', '')
	`, requestID, capturedAtMS)
	if err != nil {
		t.Fatalf("seed capture row %s: %v", requestID, err)
	}
}

func TestListCaptureTransactionsMapsFiltersAndPage(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)
	seedCaptureRow(t, db, "req-2", 200)

	app := &App{bridgeDB: db, captureReader: mobilecapture.NewReader(db)}
	page := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10})

	if page.Degraded {
		t.Fatal("expected a populated page not to be degraded")
	}
	if len(page.Items) != 2 {
		t.Fatalf("expected 2 items, got %d (%#v)", len(page.Items), page.Items)
	}
	if page.Items[0].RequestID != "req-2" {
		t.Fatalf("expected newest-first order, got %#v", page.Items)
	}
	if page.Items[0].HTTPStatus == nil || *page.Items[0].HTTPStatus != 200 {
		t.Fatalf("expected http status 200, got %#v", page.Items[0].HTTPStatus)
	}
}

func TestListCaptureTransactionsNilBridgeDBReturnsDegradedEmptyPage(t *testing.T) {
	t.Parallel()
	app := &App{}
	page := app.ListCaptureTransactions(contracts.CaptureQuery{})

	if !page.Degraded {
		t.Fatal("expected a nil captureReader to degrade")
	}
	if page.Items == nil {
		t.Fatal("expected a nil-safe (non-nil) empty Items slice")
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected an empty page, got %#v", page.Items)
	}
}

func TestListCaptureTransactionsMissingOptionalColumnsOmitsFields(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)

	app := &App{bridgeDB: db, captureReader: mobilecapture.NewReader(db)}
	page := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10})

	if len(page.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(page.Items))
	}
	if page.Items[0].DurationMS != nil {
		t.Fatalf("expected DurationMS nil when the optional column is absent, got %#v", page.Items[0].DurationMS)
	}
}

func TestGetCaptureTransactionFound(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)

	app := &App{bridgeDB: db, captureReader: mobilecapture.NewReader(db)}
	result := app.GetCaptureTransaction("req-1")

	if !result.Found {
		t.Fatalf("expected req-1 to be found, got %#v", result)
	}
	if result.Degraded {
		t.Fatal("expected a found result not to be degraded")
	}
	if result.Item.RequestID != "req-1" {
		t.Fatalf("expected request id req-1, got %q", result.Item.RequestID)
	}
	if result.Item.Payload == nil {
		t.Fatal("expected a non-nil Payload map")
	}
}

func TestGetCaptureTransactionNotFound(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)

	app := &App{bridgeDB: db, captureReader: mobilecapture.NewReader(db)}
	result := app.GetCaptureTransaction("req-missing")

	if result.Found {
		t.Fatal("expected req-missing not to be found")
	}
	if result.Degraded {
		t.Fatal("expected a not-found (but reachable) result not to be degraded")
	}
}

func TestGetCaptureTransactionNilBridgeDBReturnsDegraded(t *testing.T) {
	t.Parallel()
	app := &App{}
	result := app.GetCaptureTransaction("req-1")

	if result.Found {
		t.Fatal("expected Found false when the reader is unavailable")
	}
	if !result.Degraded {
		t.Fatal("expected a nil captureReader to degrade")
	}
}

func TestConfigureCaptureReaderIsNilSafeAndBuildsOnce(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	app := &App{bridgeDB: db, newCaptureReader: mobilecapture.NewReader}

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

func TestConfigureCaptureReaderNoopWhenBridgeDBNil(t *testing.T) {
	t.Parallel()
	app := &App{}
	app.configureCaptureReader()
	if app.captureReader != nil {
		t.Fatal("expected configureCaptureReader to stay nil when bridgeDB is nil")
	}
}
