package requestcapture

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"testing"
)

// hourMS is one hour in milliseconds, the rollup bucket width.
const hourMS = int64(60 * 60 * 1000)

// rollupRow is one request_rollup_hourly row as read back through SQL.
type rollupRow struct {
	hourMS        int64
	routeTemplate string
	statusClass   int
	deviceID      string
	count         int
	maxDurationMS int64
}

// versionRow is one response_versions row as read back through SQL.
type versionRow struct {
	routeTemplate string
	bodyHash      string
	body          string
	firstSeenMS   int64
	lastSeenMS    int64
	seenCount     int
}

// ledgerRequest describes one terminal capture written by a ledger test.
type ledgerRequest struct {
	id       string
	at       int64
	route    string
	status   *int
	device   string
	duration *int64
	body     *string
}

// intPtr returns a pointer to value.
func intPtr(value int) *int { return &value }

// int64Ptr returns a pointer to value.
func int64Ptr(value int64) *int64 { return &value }

// stringPtr returns a pointer to value.
func stringPtr(value string) *string { return &value }

// sha256Hex returns the lowercase hex sha256 of body.
func sha256Hex(body string) string {
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

// terminalRecord builds the terminal capture record for req.
func terminalRecord(req ledgerRequest) CaptureRecord {
	record := BuildTransportCaptureRecord(req.id, req.at, "get", req.route, "http")
	record.Outcome = "accepted"
	record.Device = DeviceIdentity{DeviceID: req.device}
	record.HTTPStatus = req.status
	record.DurationMS = req.duration
	record.ResponseBody = req.body
	return record
}

// upsertAll writes every record through the store, failing on the first error.
func upsertAll(t *testing.T, store *SQLiteStore, records ...CaptureRecord) {
	t.Helper()
	for _, record := range records {
		if err := store.UpsertCapture(context.Background(), record); err != nil {
			t.Fatalf("upsert %s (%s): %v", record.RequestID, record.Outcome, err)
		}
	}
}

// readRollups returns every rollup row in key order.
func readRollups(t *testing.T, db *sql.DB) []rollupRow {
	t.Helper()
	rows, err := db.Query(`
		SELECT hour_ms, route_template, status_class, device_id, request_count, max_duration_ms
		FROM request_rollup_hourly ORDER BY hour_ms, route_template, status_class, device_id`)
	if err != nil {
		t.Fatalf("query rollups: %v", err)
	}
	defer func() { _ = rows.Close() }()
	result := []rollupRow{}
	for rows.Next() {
		var row rollupRow
		if err := rows.Scan(&row.hourMS, &row.routeTemplate, &row.statusClass, &row.deviceID, &row.count, &row.maxDurationMS); err != nil {
			t.Fatalf("scan rollup: %v", err)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate rollups: %v", err)
	}
	return result
}

// readVersions returns every response version row in key order.
func readVersions(t *testing.T, db *sql.DB) []versionRow {
	t.Helper()
	rows, err := db.Query(`
		SELECT route_template, body_hash, body, first_seen_ms, last_seen_ms, seen_count
		FROM response_versions ORDER BY route_template, first_seen_ms`)
	if err != nil {
		t.Fatalf("query versions: %v", err)
	}
	defer func() { _ = rows.Close() }()
	result := []versionRow{}
	for rows.Next() {
		var row versionRow
		if err := rows.Scan(&row.routeTemplate, &row.bodyHash, &row.body, &row.firstSeenMS, &row.lastSeenMS, &row.seenCount); err != nil {
			t.Fatalf("scan version: %v", err)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate versions: %v", err)
	}
	return result
}

// assertRows compares two row slices element by element.
func assertRows[T comparable](t *testing.T, name string, got, want []T) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("expected %d %s rows, got %d: %#v", len(want), name, len(got), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("%s row %d: expected %#v, got %#v", name, index, want[index], got[index])
		}
	}
}

// TestRollupCountsTerminalRequestsPerHourRouteStatusAndDevice writes requests
// spread over two hours, two routes, three status classes and two devices,
// and pins count and max duration per bucket.
func TestRollupCountsTerminalRequestsPerHourRouteStatusAndDevice(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)
	base := 10 * hourMS
	upsertAll(t, store,
		terminalRecord(ledgerRequest{id: "r1", at: base + 5, route: "/api/animes/a1?x=1", status: intPtr(200), device: "d1", duration: int64Ptr(30)}),
		terminalRecord(ledgerRequest{id: "r2", at: base + 9, route: "/api/animes/a2", status: intPtr(204), device: "d1", duration: int64Ptr(80)}),
		terminalRecord(ledgerRequest{id: "r3", at: base + hourMS - 1, route: "/api/animes/a3", status: intPtr(201), device: "d1", duration: int64Ptr(50)}),
		terminalRecord(ledgerRequest{id: "r4", at: base + 7, route: "/api/animes/a1", status: intPtr(500), device: "d1", duration: int64Ptr(5)}),
		terminalRecord(ledgerRequest{id: "r5", at: base + 8, route: "/api/animes/a1", status: intPtr(200), device: "d2", duration: int64Ptr(10)}),
		terminalRecord(ledgerRequest{id: "r6", at: base + hourMS, route: "/api/animes/a1", status: intPtr(200), device: "d1", duration: int64Ptr(1)}),
		terminalRecord(ledgerRequest{id: "r7", at: base + 3, route: "/ws", device: ""}),
		terminalRecord(ledgerRequest{id: "r8", at: base + 4, route: "/api/status", status: intPtr(499), device: "d1", duration: int64Ptr(2)}),
	)

	assertRows(t, "rollup", readRollups(t, db), []rollupRow{
		{hourMS: base, routeTemplate: "/api/animes/:id", statusClass: 2, deviceID: "d1", count: 3, maxDurationMS: 80},
		{hourMS: base, routeTemplate: "/api/animes/:id", statusClass: 2, deviceID: "d2", count: 1, maxDurationMS: 10},
		{hourMS: base, routeTemplate: "/api/animes/:id", statusClass: 5, deviceID: "d1", count: 1, maxDurationMS: 5},
		{hourMS: base, routeTemplate: "/api/status", statusClass: 4, deviceID: "d1", count: 1, maxDurationMS: 2},
		{hourMS: base, routeTemplate: "/ws", statusClass: 0, deviceID: "", count: 1, maxDurationMS: 0},
		{hourMS: base + hourMS, routeTemplate: "/api/animes/:id", statusClass: 2, deviceID: "d1", count: 1, maxDurationMS: 1},
	})
}

// TestRollupIgnoresPendingAndCountsEachRequestOnce proves the arrival row adds
// nothing, the terminal row adds one, and a repeated terminal write (the
// dropped-terminal repair path) or a late arrival does not add another.
func TestRollupIgnoresPendingAndCountsEachRequestOnce(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)
	arrival := BuildTransportCaptureRecord("req-once", hourMS, "get", "/api/status", "http")
	upsertAll(t, store, arrival)
	assertRows(t, "rollup", readRollups(t, db), []rollupRow{})

	terminal := terminalRecord(ledgerRequest{id: "req-once", at: hourMS, route: "/api/status", status: intPtr(200), device: "d1", duration: int64Ptr(40)})
	repeat := terminal
	repeat.DurationMS = int64Ptr(90)
	upsertAll(t, store, terminal, repeat, arrival)

	reversed := terminalRecord(ledgerRequest{id: "req-reversed", at: hourMS, route: "/api/status", status: intPtr(200), device: "d1", duration: int64Ptr(10)})
	upsertAll(t, store, reversed, BuildTransportCaptureRecord("req-reversed", hourMS, "get", "/api/status", "http"))

	assertRows(t, "rollup", readRollups(t, db), []rollupRow{
		{hourMS: hourMS, routeTemplate: "/api/status", statusClass: 2, deviceID: "d1", count: 2, maxDurationMS: 40},
	})
}

// TestResponseVersionsStoreEachDistinctBodyOncePerRoute writes three requests
// with one body and one with another, out of time order, and pins the version
// rows, their counts and seen range, plus the response_hash on each capture.
func TestResponseVersionsStoreEachDistinctBodyOncePerRoute(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)
	same, other := `{"items":[1]}`, `{"items":[2]}`
	upsertAll(t, store,
		terminalRecord(ledgerRequest{id: "v1", at: 200, route: "/api/animes", status: intPtr(200), body: stringPtr(same)}),
		terminalRecord(ledgerRequest{id: "v2", at: 300, route: "/api/animes?since=1", status: intPtr(200), body: stringPtr(same)}),
		terminalRecord(ledgerRequest{id: "v3", at: 100, route: "/api/animes", status: intPtr(200), body: stringPtr(same)}),
		terminalRecord(ledgerRequest{id: "v4", at: 400, route: "/api/animes", status: intPtr(200), body: stringPtr(other)}),
		terminalRecord(ledgerRequest{id: "v5", at: 500, route: "/api/animes", status: intPtr(204), body: stringPtr("")}),
		terminalRecord(ledgerRequest{id: "v6", at: 600, route: "/api/animes", status: intPtr(204)}),
	)
	// A repeated terminal write of one request must not count its body twice.
	upsertAll(t, store, terminalRecord(ledgerRequest{id: "v4", at: 400, route: "/api/animes", status: intPtr(200), body: stringPtr(other)}))
	// A repeated terminal write that lost the body must not version an empty body.
	upsertAll(t, store, terminalRecord(ledgerRequest{id: "v1", at: 200, route: "/api/animes", status: intPtr(200), body: stringPtr("")}))

	assertRows(t, "version", readVersions(t, db), []versionRow{
		{routeTemplate: "/api/animes", bodyHash: sha256Hex(same), body: same, firstSeenMS: 100, lastSeenMS: 300, seenCount: 3},
		{routeTemplate: "/api/animes", bodyHash: sha256Hex(other), body: other, firstSeenMS: 400, lastSeenMS: 400, seenCount: 1},
	})
	for id, want := range map[string]string{"v1": "", "v2": sha256Hex(same), "v4": sha256Hex(other), "v5": "", "v6": ""} {
		if got := fetchCaptureDetail(t, db, id).ResponseHash; got != want {
			t.Fatalf("expected %s response_hash %q, got %q", id, want, got)
		}
	}
}

// TestResponseVersionCountsBodyAddedByLaterTerminalWrite covers a terminal
// row first written without a body and enriched with one later: the body is
// versioned once, when it first appears.
func TestResponseVersionCountsBodyAddedByLaterTerminalWrite(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)
	body := `{"ok":true}`
	first := terminalRecord(ledgerRequest{id: "late", at: 50, route: "/api/status", status: intPtr(200)})
	second := terminalRecord(ledgerRequest{id: "late", at: 50, route: "/api/status", status: intPtr(200), body: stringPtr(body)})
	upsertAll(t, store, first, second, second)

	assertRows(t, "version", readVersions(t, db), []versionRow{
		{routeTemplate: "/api/status", bodyHash: sha256Hex(body), body: body, firstSeenMS: 50, lastSeenMS: 50, seenCount: 1},
	})
	if got := fetchCaptureDetail(t, db, "late").ResponseHash; got != sha256Hex(body) {
		t.Fatalf("expected response_hash %q, got %q", sha256Hex(body), got)
	}
}
