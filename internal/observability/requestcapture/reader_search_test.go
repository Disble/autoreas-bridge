package requestcapture

import (
	"context"
	"database/sql"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

func TestSearchRouteAndStatusFilter(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{Route: "/api/sync/reconcile", HTTPStatus: new(400)}})
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
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{StartMS: new(int64(100)), EndMS: new(int64(199))}})
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
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{ChangelogID: new(int64(77))}})
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
	// A nil slice marshals to JSON null, which violates the MCP tool's
	// declared output schema ("want array"). An empty match must serialize
	// as [], so Items has to be non-nil even when nothing matched. len() is
	// 0 for a nil slice too, so the length assertion above cannot catch this.
	if page.Items == nil {
		t.Fatal("expected non-nil empty Items so an empty page marshals as [] rather than null")
	}
	if page.AppliedLimit == 0 {
		t.Fatalf("expected valid applied limit even for empty page, got %#v", page)
	}
}

// TestSearchEmptyPageMarshalsAsEmptyArray asserts the wire shape directly:
// the zero-match page must encode items as [], never null, because the MCP
// sidecar validates its response against a schema requiring an array.
func TestSearchEmptyPageMarshalsAsEmptyArray(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{Filters: SearchFilters{Route: "/api/animes/does-not-exist"}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}

	encoded, err := json.Marshal(page)
	if err != nil {
		t.Fatalf("marshal page: %v", err)
	}
	if !strings.Contains(string(encoded), `"items":[]`) {
		t.Fatalf("expected items to encode as [], got %s", encoded)
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
	if page.Items[0].DurationMS != nil || page.Items[0].RequestBody != nil || page.Items[0].ResponseBody != nil {
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
	store := NewStore(db, StoreConfig{})
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

// seedSearchFixtures inserts a small deterministic dataset exercising filters.
func seedSearchFixtures(t *testing.T, store *SQLiteStore) {
	t.Helper()

	patch404 := NewCaptureRecord("patch", "device-1")
	patch404.RequestID = "req-patch-404"
	patch404.CapturedAtMS = 150
	patch404.Route = "/api/animes/anime-1"
	patch404.Outcome = "rejected"
	patch404.ErrorCode = "anime_not_found"
	patch404.AnimeID = new("anime-1")
	patch404.HTTPStatus = new(404)
	if err := store.UpsertCapture(context.Background(), patch404); err != nil {
		t.Fatalf("seed patch404: %v", err)
	}

	reconcile400 := NewCaptureRecord("reconcile", "device-2")
	reconcile400.RequestID = "req-reconcile-400"
	reconcile400.CapturedAtMS = 250
	reconcile400.Route = "/api/sync/reconcile"
	reconcile400.Outcome = "rejected"
	reconcile400.ErrorCode = "apply_pending_failed"
	reconcile400.HTTPStatus = new(400)
	if err := store.UpsertCapture(context.Background(), reconcile400); err != nil {
		t.Fatalf("seed reconcile400: %v", err)
	}

	reconcileAccepted := NewCaptureRecord("reconcile", "device-3")
	reconcileAccepted.RequestID = "req-reconcile-accepted"
	reconcileAccepted.CapturedAtMS = 50
	reconcileAccepted.Route = "/api/sync/reconcile"
	reconcileAccepted.Outcome = "accepted"
	reconcileAccepted.HTTPStatus = new(202)
	reconcileAccepted.Correlations = Correlations{ChangelogIDs: []int64{77}, OperationRefs: []OperationRef{}}
	if err := store.UpsertCapture(context.Background(), reconcileAccepted); err != nil {
		t.Fatalf("seed reconcileAccepted: %v", err)
	}
}

// TestSearchReadIsBoundedToLimitPlusOneWindow pins the SQL-side LIMIT the
// search must apply: rows beyond the limit+1 window are never read. That is
// observable through malformed-row counting -- a row past the window cannot be
// counted, while a malformed row inside the window still is (and consumes a
// window slot, so a full window with one malformed row yields no cursor).
func TestSearchReadIsBoundedToLimitPlusOneWindow(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name              string
		malformedAtMS     int64
		wantMalformedRows int
		wantCursorSet     bool
	}{
		{name: "a malformed row beyond the limit+1 window is not read", malformedAtMS: 50, wantMalformedRows: 0, wantCursorSet: true},
		{name: "a malformed row inside the window is counted and consumes a window slot", malformedAtMS: 150, wantMalformedRows: 1, wantCursorSet: false},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			db := openCaptureTestDB(t)
			store := NewStore(db, StoreConfig{})
			seedDatedCaptureRows(t, store)
			seedMalformedCaptureRow(t, db, "req-bad", testCase.malformedAtMS)

			reader := NewReader(db)
			page, err := reader.Search(context.Background(), SearchParams{Limit: 2})
			if err != nil {
				t.Fatalf("search: %v", err)
			}
			if page.MalformedRowsSkipped != testCase.wantMalformedRows {
				t.Fatalf("expected malformed_rows_skipped %d, got %d", testCase.wantMalformedRows, page.MalformedRowsSkipped)
			}
			if page.WarningCount != testCase.wantMalformedRows {
				t.Fatalf("expected warning_count %d, got %d", testCase.wantMalformedRows, page.WarningCount)
			}
			if (page.NextCursor != "") != testCase.wantCursorSet {
				t.Fatalf("expected next_cursor set=%t, got %q", testCase.wantCursorSet, page.NextCursor)
			}
		})
	}
}

// TestSearchNextCursorOnlyWhenAnotherPageExists pins the cursor contract that
// must survive the LIMIT change: only a page filled to the applied limit
// proves a further page; a partial page and a zero-match page set none.
func TestSearchNextCursorOnlyWhenAnotherPageExists(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		params    SearchParams
		wantItems int
	}{
		{name: "a partial page does not set a cursor", params: SearchParams{Limit: 10}, wantItems: 3},
		{name: "zero matches return no cursor", params: SearchParams{Limit: 10, Filters: SearchFilters{Route: "/api/animes/does-not-exist"}}, wantItems: 0},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			db := openCaptureTestDB(t)
			store := NewStore(db, StoreConfig{})
			seedDatedCaptureRows(t, store)

			reader := NewReader(db)
			page, err := reader.Search(context.Background(), testCase.params)
			if err != nil {
				t.Fatalf("search: %v", err)
			}
			if len(page.Items) != testCase.wantItems {
				t.Fatalf("expected %d items, got %#v", testCase.wantItems, page.Items)
			}
			if page.NextCursor != "" {
				t.Fatalf("expected no next cursor, got %q", page.NextCursor)
			}
		})
	}
}

// TestSearchSummaryProjectionMatchesFullProjection asserts the summary
// projection (SearchParams.Summary) returns nil bodies and nil headers while
// every other field stays identical to the full projection for the same row,
// that the zero-value params still return the full projection, and that Get
// keeps returning bodies, headers and duration.
func TestSearchSummaryProjectionMatchesFullProjection(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedTelemetryCaptureRow(t, store, "req-rich", 100)

	reader := NewReader(db)
	full, err := reader.Search(context.Background(), SearchParams{Limit: 10})
	if err != nil {
		t.Fatalf("full search: %v", err)
	}
	summary, err := reader.Search(context.Background(), SearchParams{Limit: 10, Summary: true})
	if err != nil {
		t.Fatalf("summary search: %v", err)
	}
	if len(full.Items) != 1 || len(summary.Items) != 1 {
		t.Fatalf("expected one row on both projections, got full %#v summary %#v", full.Items, summary.Items)
	}

	assertFullProjectionCarriesTelemetry(t, full.Items[0])
	assertSummaryProjection(t, summary.Items[0], full.Items[0])

	result, err := reader.Get(context.Background(), "req-rich")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !result.Found {
		t.Fatal("expected req-rich to be found by Get")
	}
	assertFullProjectionCarriesTelemetry(t, result.Item)
}

// assertFullProjectionCarriesTelemetry asserts a record read with the full
// (zero-value) projection carries every optional telemetry field.
func assertFullProjectionCarriesTelemetry(t *testing.T, record CaptureRecord) {
	t.Helper()
	if record.RequestBody == nil || record.ResponseBody == nil || record.RequestHeaders == nil || record.ResponseHeaders == nil {
		t.Fatalf("expected the full projection to carry bodies and headers, got %#v", record)
	}
	if record.DurationMS == nil || *record.DurationMS != 123 {
		t.Fatalf("expected duration 123 on the full projection, got %#v", record.DurationMS)
	}
}

// assertSummaryProjection asserts summary equals full on every field except
// the four body/header blobs, which the summary projection must leave nil.
// The blobs' presence on full is asserted by assertFullProjectionCarriesTelemetry.
func assertSummaryProjection(t *testing.T, summary, full CaptureRecord) {
	t.Helper()
	expected := full
	expected.RequestBody = nil
	expected.ResponseBody = nil
	expected.RequestHeaders = nil
	expected.ResponseHeaders = nil
	if !reflect.DeepEqual(summary, expected) {
		t.Fatalf("expected summary %#v to equal the full projection minus bodies and headers %#v", summary, expected)
	}
}

// seedDatedCaptureRows stores three well-formed captures at 300/200/100 ms so
// a limit=2 search has a full limit+1 window of good rows.
func seedDatedCaptureRows(t *testing.T, store *SQLiteStore) {
	t.Helper()
	for i, requestID := range []string{"req-a", "req-b", "req-c"} {
		record := NewCaptureRecord("patch", "device-1")
		record.RequestID = requestID
		record.CapturedAtMS = int64(300 - 100*i)
		if err := store.UpsertCapture(context.Background(), record); err != nil {
			t.Fatalf("seed capture %s: %v", requestID, err)
		}
	}
}

// seedMalformedCaptureRow inserts one capture row with unparseable payload
// JSON directly, bypassing the store, so scanning it fails at read time.
func seedMalformedCaptureRow(t *testing.T, db *sql.DB, requestID string, capturedAtMS int64) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES (?, ?, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{bad', '{"operation_refs":[]}')
	`, requestID, capturedAtMS)
	if err != nil {
		t.Fatalf("seed malformed capture row %s: %v", requestID, err)
	}
}

// seedTelemetryCaptureRow stores one capture carrying bodies, body states,
// header sets and a duration -- the row shape the projection tests compare.
func seedTelemetryCaptureRow(t *testing.T, store *SQLiteStore, requestID string, capturedAtMS int64) {
	t.Helper()
	requestBody := `{"name":"x","nested":{"n":1},"secret":"keep-me"}`
	responseBody := `{"error":"failed"}`
	duration := int64(123)
	record := NewCaptureRecord("patch", "device-1")
	record.RequestID, record.CapturedAtMS = requestID, capturedAtMS
	record.RequestBody, record.ResponseBody, record.DurationMS = &requestBody, &responseBody, &duration
	record.RequestBodyState, record.ResponseBodyState = CaptureStateTruncated, CaptureStateOmittedTooLarge
	record.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	record.ResponseHeaders = map[string]string{"Content-Type": "application/json"}
	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("seed telemetry capture %s: %v", requestID, err)
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
