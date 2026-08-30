package main

import (
	"context"
	"database/sql"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/requestcapture"
)

// summaryCaptureSeed describes one capture row for the request-health fixtures.
// It exists so a table case can vary route, status, outcome and error code
// independently -- the three columns the aggregation groups by, plus the one it
// samples on.
type summaryCaptureSeed struct {
	requestID    string
	capturedAtMS int64
	route        string
	outcome      string
	transport    string
	httpStatus   *int
	errorCode    string
}

// seedSummaryCaptureRow inserts one capture row shaped by the given seed. A nil
// httpStatus leaves the column NULL, which is what every websocket capture
// carries: measured 2026-08-30, 537 of 1,317 stored captures were websocket and
// none of them had an HTTP status.
func seedSummaryCaptureRow(t *testing.T, db *sql.DB, seed summaryCaptureSeed) {
	t.Helper()
	transport := seed.transport
	if transport == "" {
		transport = "http"
	}
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code
		) VALUES (?, ?, 'patch', ?, ?, 'device-1', 'Phone', ?,
			'anime-1', ?, '{"status":1}', '{"operation_refs":[]}', ?)
	`, seed.requestID, seed.capturedAtMS, seed.route, transport, seed.outcome, seed.httpStatus, seed.errorCode)
	if err != nil {
		t.Fatalf("seed summary capture row %s: %v", seed.requestID, err)
	}
}

// findSummaryGroup returns the group matching one (route, status, outcome)
// combination. A nil wantStatus matches only the NULL-status group, which is
// the distinction the surface must never collapse.
func findSummaryGroup(groups []contracts.CaptureSummaryGroup, route string, wantStatus *int, outcome string) *contracts.CaptureSummaryGroup {
	for index := range groups {
		group := &groups[index]
		if group.Route != route || group.Outcome != outcome {
			continue
		}
		if !sameOptionalStatus(group.HTTPStatus, wantStatus) {
			continue
		}

		return group
	}

	return nil
}

// sameOptionalStatus reports whether two optional HTTP statuses describe the
// same filter state: both absent, or both present with the same value. Kept
// outside the search loop so the loop body stays a flat sequence of guards.
func sameOptionalStatus(got, want *int) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}

	return *got == *want
}

// countCaptureRows reports how many rows the captures table holds, so a
// read-only aggregation can be proven not to have written anything.
func countCaptureRows(t *testing.T, db *sql.DB) int {
	t.Helper()
	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM request_captures`).Scan(&total); err != nil {
		t.Fatalf("count capture rows: %v", err)
	}

	return total
}

// intPtr returns a pointer to v, so a fixture can express "this row carries
// exactly this HTTP status" separately from "this row carries none".
func intPtr(v int) *int {
	return &v
}

func TestSummarizeCaptureTransactionsGroupsByRouteStatusAndOutcome(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "a-1", capturedAtMS: 100, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "a-2", capturedAtMS: 200, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "a-3", capturedAtMS: 300, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "b-1", capturedAtMS: 400, route: "/api/animes", outcome: "abandoned", httpStatus: intPtr(404), errorCode: "not_found"})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "b-2", capturedAtMS: 500, route: "/api/animes", outcome: "abandoned", httpStatus: intPtr(404), errorCode: "not_found"})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "c-1", capturedAtMS: 600, route: "/api/sync", outcome: "accepted", httpStatus: intPtr(202)})

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	summary := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})

	if summary.Degraded {
		t.Fatal("expected a readable aggregation not to be degraded")
	}
	if len(summary.Groups) != 3 {
		t.Fatalf("expected one group per route/status/outcome combination, got %#v", summary.Groups)
	}
	if summary.Groups[0].Count != 3 || summary.Groups[1].Count != 2 || summary.Groups[2].Count != 1 {
		t.Fatalf("expected counts ordered 3, 2, 1 descending, got %#v", summary.Groups)
	}
	completed := findSummaryGroup(summary.Groups, "/api/animes", intPtr(200), "completed")
	if completed == nil || completed.Count != 3 {
		t.Fatalf("expected the 200/completed group to count 3, got %#v", completed)
	}
}

func TestSummarizeCaptureTransactionsKeepsTheNullStatusGroupDistinct(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "ws-1", capturedAtMS: 100, route: "/ws/sync", outcome: "pushed", transport: "websocket"})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "ws-2", capturedAtMS: 200, route: "/ws/sync", outcome: "pushed", transport: "websocket"})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "http-1", capturedAtMS: 300, route: "/ws/sync", outcome: "pushed", httpStatus: intPtr(200)})

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	summary := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})

	// A transport that never produced an HTTP status is not a status 0, and it
	// is not the 200 group either. Collapsing the two would erase 40.8% of the
	// real table (measured 2026-08-30) into a status the bridge never returned.
	if len(summary.Groups) != 2 {
		t.Fatalf("expected the NULL-status rows to form their own group, got %#v", summary.Groups)
	}
	statusless := findSummaryGroup(summary.Groups, "/ws/sync", nil, "pushed")
	if statusless == nil {
		t.Fatalf("expected a group carrying no HTTP status, got %#v", summary.Groups)
	}
	if statusless.Count != 2 {
		t.Fatalf("expected the statusless group to count 2, got %d", statusless.Count)
	}
	if statusless.HTTPStatus != nil {
		t.Fatalf("expected the statusless group to carry a nil status, got %d", *statusless.HTTPStatus)
	}
}

func TestSummarizeCaptureTransactionsCapsErrorSamplesAtFiveNewestFirst(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	for index := 1; index <= 7; index++ {
		seedSummaryCaptureRow(t, db, summaryCaptureSeed{
			requestID:    "err-" + string(rune('a'+index-1)),
			capturedAtMS: int64(index) * 100,
			route:        "/api/animes",
			outcome:      "abandoned",
			httpStatus:   intPtr(404),
			errorCode:    "not_found",
		})
	}

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	summary := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})

	if len(summary.Groups) != 1 {
		t.Fatalf("expected a single group, got %#v", summary.Groups)
	}
	group := summary.Groups[0]
	if group.Count != 7 {
		t.Fatalf("expected the group to count every row, got %d", group.Count)
	}
	if len(group.LatestErrorSamples) != 5 {
		t.Fatalf("expected the samples to be capped at 5, got %d", len(group.LatestErrorSamples))
	}
	if group.LatestErrorSamples[0].CapturedAtMS != 700 {
		t.Fatalf("expected the newest sample first, got %d", group.LatestErrorSamples[0].CapturedAtMS)
	}
	if group.LatestErrorSamples[0].ErrorCode != "not_found" {
		t.Fatalf("expected the sample's error code to be carried, got %q", group.LatestErrorSamples[0].ErrorCode)
	}
	if group.LatestErrorSamples[0].RequestID != "err-g" {
		t.Fatalf("expected the newest sample's request id, got %q", group.LatestErrorSamples[0].RequestID)
	}
}

func TestSummarizeCaptureTransactionsAcceptsTheTransactionListFilters(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "keep-1", capturedAtMS: 100, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "drop-1", capturedAtMS: 200, route: "/api/sync", outcome: "accepted", httpStatus: intPtr(202)})
	if _, err := db.Exec(`UPDATE request_captures SET device_id = 'device-9' WHERE request_id = 'keep-1'`); err != nil {
		t.Fatalf("seed device id: %v", err)
	}

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}

	byRoute := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{Route: "/api/animes"})
	if len(byRoute.Groups) != 1 || byRoute.Groups[0].Route != "/api/animes" {
		t.Fatalf("expected the route filter to scope the aggregation, got %#v", byRoute.Groups)
	}

	byDevice := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{DeviceID: "device-9"})
	if len(byDevice.Groups) != 1 || byDevice.Groups[0].Count != 1 {
		t.Fatalf("expected the device filter to scope the aggregation, got %#v", byDevice.Groups)
	}

	start := int64(150)
	byWindow := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{StartMS: &start})
	if len(byWindow.Groups) != 1 || byWindow.Groups[0].Route != "/api/sync" {
		t.Fatalf("expected the time window to scope the aggregation, got %#v", byWindow.Groups)
	}
}

func TestSummarizeCaptureTransactionsEmptyMatchIsZeroedNotAnError(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "only-1", capturedAtMS: 100, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	summary := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{Route: "/api/nothing-here"})

	if summary.Degraded {
		t.Fatal("expected an unmatched filter set to be a measured empty result, not a degraded one")
	}
	if summary.Groups == nil {
		t.Fatal("expected a nil-safe (non-nil) empty Groups slice")
	}
	if len(summary.Groups) != 0 {
		t.Fatalf("expected no fabricated groups, got %#v", summary.Groups)
	}
}

func TestSummarizeCaptureTransactionsNilReaderDegrades(t *testing.T) {
	t.Parallel()
	app := &App{}
	summary := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})

	if !summary.Degraded {
		t.Fatal("expected a nil captureReader to degrade")
	}
	if summary.Groups == nil {
		t.Fatal("expected a nil-safe (non-nil) empty Groups slice")
	}
	if len(summary.Groups) != 0 {
		t.Fatalf("expected an empty aggregation, got %#v", summary.Groups)
	}
}

func TestSummarizeCaptureTransactionsMutatesNothing(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "keep-1", capturedAtMS: 100, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "keep-2", capturedAtMS: 200, route: "/api/animes", outcome: "abandoned", httpStatus: intPtr(404), errorCode: "not_found"})
	before := countCaptureRows(t, db)

	app := &App{bridgeDB: db, captureReader: requestcapture.NewReader(db)}
	app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})

	if after := countCaptureRows(t, db); after != before {
		t.Fatalf("expected the aggregation to write nothing, row count went from %d to %d", before, after)
	}
}

// TestSummarizeCaptureTransactionsAgreesWithTheReaderTheMCPDelegatesTo is the
// parity criterion for task 4.3. It asserts against requestcapture.Reader
// itself -- the exact engine the MCP's summary_requests tool delegates to
// (internal/mcp/requestcapture/tools.go's summaryRequests is a one-line call
// into it) -- rather than against a re-implementation of the grouping, so the
// desktop surface and the agent cannot silently drift apart.
func TestSummarizeCaptureTransactionsAgreesWithTheReaderTheMCPDelegatesTo(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "p-1", capturedAtMS: 100, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "p-2", capturedAtMS: 200, route: "/api/animes", outcome: "completed", httpStatus: intPtr(200)})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "p-3", capturedAtMS: 300, route: "/api/animes", outcome: "abandoned", httpStatus: intPtr(404), errorCode: "not_found"})
	seedSummaryCaptureRow(t, db, summaryCaptureSeed{requestID: "p-4", capturedAtMS: 400, route: "/ws/sync", outcome: "pushed", transport: "websocket"})

	reader := requestcapture.NewReader(db)
	app := &App{bridgeDB: db, captureReader: reader}

	expected, err := reader.Summary(context.Background(), requestcapture.SearchFilters{})
	if err != nil {
		t.Fatalf("reader summary: %v", err)
	}
	if len(expected.Groups) != 3 {
		t.Fatalf("expected the fixture to produce three groups, got %#v", expected.Groups)
	}

	got := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})

	if len(got.Groups) != len(expected.Groups) {
		t.Fatalf("expected %d groups to match the reader, got %d", len(expected.Groups), len(got.Groups))
	}
	for index, want := range expected.Groups {
		assertSummaryGroupMatchesReader(t, index, got.Groups[index], want)
	}
}

// assertSummaryGroupMatchesReader compares one bound group against the reader's
// own group. It lives outside the parity loop so the loop body stays flat: the
// status pointer alone needs three branches, which pushed the inlined version
// over the repo's gocognit ceiling.
func assertSummaryGroupMatchesReader(t *testing.T, index int, got contracts.CaptureSummaryGroup, want requestcapture.SummaryGroup) {
	t.Helper()

	if got.Route != want.Route || got.Outcome != want.Outcome || got.Count != want.Count {
		t.Fatalf("group %d diverges from the reader: got %#v want %#v", index, got, want)
	}
	if !sameOptionalStatus(got.HTTPStatus, want.HTTPStatus) {
		t.Fatalf("group %d status diverges from the reader: got %v want %v", index, got.HTTPStatus, want.HTTPStatus)
	}
	if len(got.LatestErrorSamples) != len(want.LatestErrorSamples) {
		t.Fatalf("group %d sample count diverges: got %d want %d", index, len(got.LatestErrorSamples), len(want.LatestErrorSamples))
	}
	for sampleIndex, wantSample := range want.LatestErrorSamples {
		gotSample := got.LatestErrorSamples[sampleIndex]
		if gotSample.RequestID != wantSample.RequestID || gotSample.CapturedAtMS != wantSample.CapturedAtMS || gotSample.ErrorCode != wantSample.ErrorCode {
			t.Fatalf("group %d sample %d diverges: got %#v want %#v", index, sampleIndex, gotSample, wantSample)
		}
	}
}
