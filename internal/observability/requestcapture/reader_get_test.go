package requestcapture

import (
	"context"
	"database/sql"
	"testing"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

func TestGetToleratesMissingOptionalColumns(t *testing.T) {
	t.Parallel()

	db := openLegacyCaptureSchemaDB(t)
	_, err := db.Exec(`
		INSERT INTO mobile_request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json, error_code
		) VALUES ('req-legacy', 10, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{}', '{"operation_refs":[]}', '')
	`)
	if err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-legacy")
	if err != nil {
		t.Fatalf("expected legacy schema get to succeed, got %v", err)
	}
	if !result.Found || result.Item.RequestID != "req-legacy" {
		t.Fatalf("expected legacy row returned, got %#v", result)
	}
	if result.Item.DurationMS != nil || result.Item.RequestBody != nil || result.Item.ResponseBody != nil {
		t.Fatalf("expected optional telemetry fields nil on legacy schema, got %#v", result.Item)
	}
}

func TestGetExposesTelemetryWhenCaptured(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)
	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-with-telemetry"
	record.CapturedAtMS = 5
	duration := int64(123)
	requestBody := `{"name":"x","nested":{"n":1},"secret":"keep-me"}`
	body := `{"error":"failed"}`
	record.DurationMS = &duration
	record.RequestBody = &requestBody
	record.RequestBodyState = CaptureStateOmittedTooLarge
	record.ResponseBody = &body
	record.ResponseBodyState = CaptureStateTruncated
	record.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	record.ResponseHeaders = map[string]string{"Content-Type": "application/json"}
	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("insert: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-with-telemetry")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !result.Found {
		t.Fatal("expected record found")
	}
	if result.Item.DurationMS == nil || *result.Item.DurationMS != 123 {
		t.Fatalf("expected duration_ms 123, got %#v", result.Item.DurationMS)
	}
	if result.Item.RequestBody == nil || *result.Item.RequestBody != requestBody {
		t.Fatalf("expected request body %q, got %#v", requestBody, result.Item.RequestBody)
	}
	if result.Item.RequestBodyState != CaptureStateOmittedTooLarge {
		t.Fatalf("expected request body state %q, got %q", CaptureStateOmittedTooLarge, result.Item.RequestBodyState)
	}
	if result.Item.ResponseBody == nil || *result.Item.ResponseBody != body {
		t.Fatalf("expected response body %q, got %#v", body, result.Item.ResponseBody)
	}
	if result.Item.ResponseBodyState != CaptureStateTruncated {
		t.Fatalf("expected response body state %q, got %q", CaptureStateTruncated, result.Item.ResponseBodyState)
	}
	if result.Item.RequestHeaders["Content-Type"] != "application/json" {
		t.Fatalf("expected request headers exposed, got %#v", result.Item.RequestHeaders)
	}
	if result.Item.ResponseHeaders["Content-Type"] != "application/json" {
		t.Fatalf("expected response headers exposed, got %#v", result.Item.ResponseHeaders)
	}
}

func TestGetOmitsMissingOptionalFields(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)
	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-no-telemetry-get"
	record.CapturedAtMS = 5
	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("insert: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-no-telemetry-get")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !result.Found {
		t.Fatal("expected record found")
	}
	if result.Item.DurationMS != nil || result.Item.RequestBody != nil || result.Item.ResponseBody != nil || result.Item.RequestHeaders != nil || result.Item.ResponseHeaders != nil {
		t.Fatalf("expected optional telemetry fields nil, got %#v", result.Item)
	}
}

// openLegacyCaptureSchemaDB builds a raw SQLite database with the pre-additive
// (version-1) capture schema, without the four optional columns, on the
// previously-named table -- this is the one fixture that keeps the
// dual-generation read tolerance covered (Design "Dual-generation read
// tolerance"): the reader must resolve the previous-generation table name
// *and* tolerate the missing optional columns at the same time.
func openLegacyCaptureSchemaDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	_, err = db.Exec(`
		CREATE TABLE mobile_request_captures (
			request_id TEXT PRIMARY KEY,
			captured_at_ms INTEGER NOT NULL,
			kind TEXT NOT NULL,
			route TEXT NOT NULL,
			transport TEXT NOT NULL,
			device_id TEXT NOT NULL,
			device_name TEXT NOT NULL,
			outcome TEXT NOT NULL,
			anime_id TEXT,
			http_status INTEGER,
			payload_json TEXT NOT NULL,
			correlation_json TEXT NOT NULL,
			error_code TEXT NOT NULL DEFAULT ''
		)
	`)
	if err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}
	return db
}
