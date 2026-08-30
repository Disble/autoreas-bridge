package main

import (
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/api/contracts"
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

func TestListCaptureTransactionsMapsFiltersAndPage(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)
	seedCaptureRow(t, db, "req-2", 200)

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
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

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
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
	requestBody := `{"name":"x","nested":{"n":1},"secret":"keep-me"}`
	if _, err := db.Exec(`UPDATE request_captures SET request_body = ?, request_body_state = ?, response_body_state = ? WHERE request_id = ?`, requestBody, requestcapture.CaptureStateOmittedTooLarge, requestcapture.CaptureStateTruncated, "req-1"); err != nil {
		t.Fatalf("seed request body: %v", err)
	}

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
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
	if result.Item.RequestBody == nil || *result.Item.RequestBody != requestBody {
		t.Fatalf("expected exact request body %q, got %#v", requestBody, result.Item.RequestBody)
	}
	if result.Item.RequestBodyState != requestcapture.CaptureStateOmittedTooLarge {
		t.Fatalf("expected request body state to round-trip, got %q", result.Item.RequestBodyState)
	}
	if result.Item.ResponseBodyState != requestcapture.CaptureStateTruncated {
		t.Fatalf("expected response body state to round-trip, got %q", result.Item.ResponseBodyState)
	}
}

func TestGetCaptureTransactionNotFound(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
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

func TestConfigureCaptureReaderNoopWhenBridgeDBNil(t *testing.T) {
	t.Parallel()
	app := &App{}
	app.configureCaptureReader()
	if app.captureReader != nil {
		t.Fatal("expected configureCaptureReader to stay nil when bridgeDB is nil")
	}
}

// int64Ptr returns a pointer to v, so a table case can express "this filter is
// present and its value is exactly v" -- including v = 0, which a value type
// could not tell apart from "no filter at all".
func int64Ptr(v int64) *int64 {
	return &v
}

func TestToSearchParamsCarriesDeviceAndChangelogFilters(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name               string
		query              contracts.CaptureQuery
		wantDeviceID       string
		wantChangelogIDSet bool
		wantChangelogIDVal int64
	}{
		{
			name:               "device id reaches the reader filters",
			query:              contracts.CaptureQuery{DeviceID: "device-7"},
			wantDeviceID:       "device-7",
			wantChangelogIDSet: false,
		},
		{
			name:               "an absent device id stays empty",
			query:              contracts.CaptureQuery{},
			wantDeviceID:       "",
			wantChangelogIDSet: false,
		},
		{
			name:               "changelog id 0 survives as a real filter",
			query:              contracts.CaptureQuery{ChangelogID: int64Ptr(0)},
			wantDeviceID:       "",
			wantChangelogIDSet: true,
			wantChangelogIDVal: 0,
		},
		{
			name:               "a populated changelog id is carried verbatim",
			query:              contracts.CaptureQuery{ChangelogID: int64Ptr(4211)},
			wantDeviceID:       "",
			wantChangelogIDSet: true,
			wantChangelogIDVal: 4211,
		},
		{
			name:               "a nil changelog id stays absent",
			query:              contracts.CaptureQuery{ChangelogID: nil},
			wantDeviceID:       "",
			wantChangelogIDSet: false,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			params := toSearchParams(testCase.query)

			if params.Filters.DeviceID != testCase.wantDeviceID {
				t.Fatalf("expected device id %q, got %q", testCase.wantDeviceID, params.Filters.DeviceID)
			}
			assertChangelogIDFilter(t, params.Filters.ChangelogID, testCase.wantChangelogIDSet, testCase.wantChangelogIDVal)
		})
	}
}

// assertChangelogIDFilter checks the optional changelog filter that toSearchParams
// carries. It lives outside the table loop so the case body stays a flat sequence
// of assertions: inlining the set/absent branching pushed the test over the
// gocognit ceiling the repo lints for.
func assertChangelogIDFilter(t *testing.T, got *int64, wantSet bool, wantValue int64) {
	t.Helper()

	if !wantSet {
		if got != nil {
			t.Fatalf("expected no changelog id filter, got %d", *got)
		}

		return
	}

	if got == nil {
		t.Fatal("expected a non-nil changelog id filter, got nil")
	}

	if *got != wantValue {
		t.Fatalf("expected changelog id %d, got %d", wantValue, *got)
	}
}

// seedTransportCaptureRow inserts one capture row for a given transport and
// HTTP status, passing httpStatus as nil to leave the column NULL. Websocket
// captures carry no HTTP status at all: measured 2026-08-30 over a month of
// real use, 537 of 1,317 stored captures were websocket and every one of them
// had a NULL http_status.
func seedTransportCaptureRow(t *testing.T, db *sql.DB, requestID string, capturedAtMS int64, transport string, httpStatus *int) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code
		) VALUES (?, ?, 'patch', '/api/animes/anime-1', ?, 'device-1', 'Phone', 'accepted',
			'anime-1', ?, '{"status":1}', '{"operation_refs":[]}', '')
	`, requestID, capturedAtMS, transport, httpStatus)
	if err != nil {
		t.Fatalf("seed %s capture row %s: %v", transport, requestID, err)
	}
}

// collectRequestIDs lists a page's request ids in the order they were returned.
func collectRequestIDs(page contracts.CapturePage) []string {
	ids := make([]string, 0, len(page.Items))
	for _, item := range page.Items {
		ids = append(ids, item.RequestID)
	}
	return ids
}

// containsRequestID reports whether a page holds the given request id.
func containsRequestID(page contracts.CapturePage, requestID string) bool {
	for _, item := range page.Items {
		if item.RequestID == requestID {
			return true
		}
	}
	return false
}

func TestListCaptureTransactionsUnsetStatusFilterKeepsNullStatusRows(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	status404 := 404
	status200 := 200
	seedTransportCaptureRow(t, db, "req-ws", 300, "websocket", nil)
	seedTransportCaptureRow(t, db, "req-404", 200, "http", &status404)
	seedTransportCaptureRow(t, db, "req-200", 100, "http", &status200)

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	page := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10})

	if len(page.Items) != 3 {
		t.Fatalf("expected an unset status filter to return every row, got %v", collectRequestIDs(page))
	}
	if !containsRequestID(page, "req-ws") {
		t.Fatalf("expected the websocket row (NULL http_status) to survive an unset status filter, got %v", collectRequestIDs(page))
	}
}

func TestListCaptureTransactionsExplicitStatusFilterExcludesNullStatusRows(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	status404 := 404
	status200 := 200
	seedTransportCaptureRow(t, db, "req-ws", 300, "websocket", nil)
	seedTransportCaptureRow(t, db, "req-404", 200, "http", &status404)
	seedTransportCaptureRow(t, db, "req-200", 100, "http", &status200)

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	filter := 404
	page := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10, HTTPStatus: &filter})

	// An explicit status filter EXCLUDES rows carrying no status: a transport
	// that never produced an HTTP status is not a 404. That is deliberate, and
	// it is the reason the frontend must send no status at all when the user
	// has not chosen one -- a filter defaulted to a concrete status would erase
	// every websocket transaction from the tab.
	if len(page.Items) != 1 {
		t.Fatalf("expected exactly the 404 row, got %v", collectRequestIDs(page))
	}
	if page.Items[0].RequestID != "req-404" {
		t.Fatalf("expected req-404, got %q", page.Items[0].RequestID)
	}
}

func TestListCaptureTransactionsDeviceAndChangelogFiltersReachTheWholeTable(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)
	seedCaptureRow(t, db, "req-2", 200)
	if _, err := db.Exec(`UPDATE request_captures SET device_id = 'device-9', correlation_json = '{"operation_refs":[],"changelog_ids":[77]}' WHERE request_id = 'req-2'`); err != nil {
		t.Fatalf("seed device/changelog correlation: %v", err)
	}

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}

	byDevice := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10, DeviceID: "device-9"})
	if len(byDevice.Items) != 1 || byDevice.Items[0].RequestID != "req-2" {
		t.Fatalf("expected only req-2 for device-9, got %v", collectRequestIDs(byDevice))
	}

	changelogID := int64(77)
	byChangelog := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10, ChangelogID: &changelogID})
	if len(byChangelog.Items) != 1 || byChangelog.Items[0].RequestID != "req-2" {
		t.Fatalf("expected only req-2 for changelog 77, got %v", collectRequestIDs(byChangelog))
	}
}
