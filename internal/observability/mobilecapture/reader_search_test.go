package mobilecapture

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestSearchRouteAndStatusFilter(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{Route: "/api/sync/reconcile", HTTPStatus: intRef(400)}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].RequestID != "req-reconcile-400" {
		t.Fatalf("expected only req-reconcile-400, got %#v", page.Items)
	}
}

func TestSearchTimeWindowFilter(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{StartMS: int64Ref(100), EndMS: int64Ref(199)}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	for _, item := range page.Items {
		if item.CapturedAtMS < 100 || item.CapturedAtMS > 199 {
			t.Fatalf("expected all items within window, got %#v", item)
		}
	}
	if len(page.Items) == 0 {
		t.Fatal("expected at least one item within the time window")
	}
}

func TestSearchAnimeAndErrorCodeFilter(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{AnimeID: "anime-1", ErrorCode: "anime_not_found", Route: "/api/animes/anime-1"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].RequestID != "req-patch-404" {
		t.Fatalf("expected only req-patch-404, got %#v", page.Items)
	}
}

func TestSearchChangelogCorrelationFilter(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{ChangelogID: int64Ref(77)}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].RequestID != "req-reconcile-accepted" {
		t.Fatalf("expected only req-reconcile-accepted, got %#v", page.Items)
	}
}

func TestSearchUnmatchedFiltersEmptyPage(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{Route: "/api/animes/does-not-exist"}})
	if err != nil {
		t.Fatalf("expected no error for unmatched filters, got %v", err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("expected empty page, got %#v", page.Items)
	}
	if page.AppliedLimit == 0 {
		t.Fatalf("expected valid applied limit even for empty page, got %#v", page)
	}
}

func TestSearchToleratesMissingOptionalColumns(t *testing.T) {
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
	page, err := reader.Search(context.Background(), SearchParams{})
	if err != nil {
		t.Fatalf("expected legacy schema search to succeed, got %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].RequestID != "req-legacy" {
		t.Fatalf("expected legacy row returned, got %#v", page.Items)
	}
	if page.Items[0].DurationMS != nil || page.Items[0].ResponseBody != nil {
		t.Fatalf("expected optional telemetry fields nil on legacy schema, got %#v", page.Items[0])
	}
}

func TestGetExposesTelemetryWhenCaptured(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-with-telemetry"
	record.CapturedAtMS = 5
	duration := int64(123)
	body := `{"error":"failed"}`
	record.DurationMS = &duration
	record.ResponseBody = &body
	record.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	record.ResponseHeaders = map[string]string{"Content-Type": "application/json"}
	if err := store.InsertCapture(context.Background(), record); err != nil {
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
	if result.Item.ResponseBody == nil || *result.Item.ResponseBody != body {
		t.Fatalf("expected response body %q, got %#v", body, result.Item.ResponseBody)
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
	store := NewStore(db, StoreConfig{})
	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-no-telemetry-get"
	record.CapturedAtMS = 5
	if err := store.InsertCapture(context.Background(), record); err != nil {
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
	if result.Item.DurationMS != nil || result.Item.ResponseBody != nil || result.Item.RequestHeaders != nil || result.Item.ResponseHeaders != nil {
		t.Fatalf("expected optional telemetry fields nil, got %#v", result.Item)
	}
}

// seedSearchFixtures inserts a small deterministic dataset exercising filters.
func seedSearchFixtures(t *testing.T, store *SQLiteStore) {
	t.Helper()

	patch404 := NewCaptureRecord("patch", "device-1")
	patch404.RequestID = "req-patch-404"
	patch404.CapturedAtMS = 150
	patch404.Route = "/api/animes/anime-1"
	patch404.Outcome = "rejected"
	patch404.ErrorCode = "anime_not_found"
	patch404.AnimeID = stringRef("anime-1")
	patch404.HTTPStatus = intRef(404)
	if err := store.InsertCapture(context.Background(), patch404); err != nil {
		t.Fatalf("seed patch404: %v", err)
	}

	reconcile400 := NewCaptureRecord("reconcile", "device-2")
	reconcile400.RequestID = "req-reconcile-400"
	reconcile400.CapturedAtMS = 250
	reconcile400.Route = "/api/sync/reconcile"
	reconcile400.Outcome = "rejected"
	reconcile400.ErrorCode = "apply_pending_failed"
	reconcile400.HTTPStatus = intRef(400)
	if err := store.InsertCapture(context.Background(), reconcile400); err != nil {
		t.Fatalf("seed reconcile400: %v", err)
	}

	reconcileAccepted := NewCaptureRecord("reconcile", "device-3")
	reconcileAccepted.RequestID = "req-reconcile-accepted"
	reconcileAccepted.CapturedAtMS = 50
	reconcileAccepted.Route = "/api/sync/reconcile"
	reconcileAccepted.Outcome = "accepted"
	reconcileAccepted.HTTPStatus = intRef(202)
	reconcileAccepted.Correlations = Correlations{ChangelogIDs: []int64{77}, OperationRefs: []OperationRef{}}
	if err := store.InsertCapture(context.Background(), reconcileAccepted); err != nil {
		t.Fatalf("seed reconcileAccepted: %v", err)
	}
}

// openLegacyCaptureSchemaDB builds a raw SQLite database with the pre-additive
// (version-1) mobile_request_captures schema, without the four optional columns.
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

// intRef returns a pointer to the given int value, for building test fixtures.
func intRef(value int) *int { return &value }

// int64Ref returns a pointer to the given int64 value, for building test fixtures.
func int64Ref(value int64) *int64 { return &value }

// stringRef returns a pointer to the given string value, for building test fixtures.
func stringRef(value string) *string { return &value }
