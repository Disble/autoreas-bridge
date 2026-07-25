package requestcapture

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

func TestRetentionPrunesOldestAuxiliaryRowsOnly(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{RetentionLimit: 3, PruneEvery: 1})

	for index := 1; index <= 5; index++ {
		record := NewCaptureRecord("patch", "device")
		record.RequestID = requestID(index)
		record.CapturedAtMS = int64(index)
		animeID := "anime-1"
		record.AnimeID = &animeID
		if err := store.UpsertCapture(context.Background(), record); err != nil {
			t.Fatalf("insert capture %d: %v", index, err)
		}
	}

	ids := readCaptureIDs(t, db)
	if got := strings.Join(ids, ","); got != "req-3,req-4,req-5" {
		t.Fatalf("expected newest three request ids, got %s", got)
	}
	if got := countRows(t, db, "anime_snapshots"); got != 0 {
		t.Fatalf("expected canonical anime rows untouched, got %d", got)
	}
}

func TestStoreSkipsMalformedHistoricalRowsWithWarnings(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES
			('req-good', 20, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{"status":1}', '{"operation_refs":[]}'),
			('req-bad', 10, 'patch', '/api/animes/anime-2', 'http', 'device-2', 'Phone', 'accepted', '{bad', '{"operation_refs":[]}')
	`)
	if err != nil {
		t.Fatalf("seed captures: %v", err)
	}

	reader := NewReader(db)
	page, err := reader.Search(context.Background(), SearchParams{})
	if err != nil {
		t.Fatalf("search captures: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].RequestID != "req-good" {
		t.Fatalf("expected only the well-formed row, got %#v", page.Items)
	}
	if page.MalformedRowsSkipped != 1 {
		t.Fatalf("expected malformed_rows_skipped 1, got %d", page.MalformedRowsSkipped)
	}
	if page.WarningCount != 1 {
		t.Fatalf("expected warning_count 1, got %d", page.WarningCount)
	}
}

func TestSearchCursorPaginatesEqualTimestampsWithoutDuplicates(t *testing.T) {
	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	for _, item := range []struct {
		id string
		at int64
	}{{"req-z", 9}, {"req-a", 10}, {"req-b", 10}, {"req-c", 10}} {
		record := NewCaptureRecord("patch", "device")
		record.RequestID, record.CapturedAtMS = item.id, item.at
		if err := store.UpsertCapture(context.Background(), record); err != nil {
			t.Fatalf("insert %s: %v", item.id, err)
		}
	}

	reader := NewReader(db)
	first, err := reader.Search(context.Background(), SearchParams{Limit: 2})
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	second, err := reader.Search(context.Background(), SearchParams{Limit: 2, Cursor: first.NextCursor})
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if got := first.Items[0].RequestID + "," + first.Items[1].RequestID + "," + second.Items[0].RequestID + "," + second.Items[1].RequestID; got != "req-c,req-b,req-a,req-z" {
		t.Fatalf("unexpected page order %s", got)
	}
	if first.NextCursor == "" || second.NextCursor != "" {
		t.Fatalf("expected first continuation and terminal second page, got %q and %q", first.NextCursor, second.NextCursor)
	}
}

func TestUpsertCaptureWritesTelemetryColumns(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})

	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-telemetry"
	record.CapturedAtMS = 1
	duration := int64(42)
	body := `{"error":"anime not found"}`
	record.DurationMS = &duration
	record.ResponseBody = &body
	record.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	record.ResponseHeaders = map[string]string{"Content-Type": "application/json"}

	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("insert capture: %v", err)
	}

	var (
		gotDuration        sql.NullInt64
		gotResponseBody    sql.NullString
		gotRequestHeaders  sql.NullString
		gotResponseHeaders sql.NullString
	)
	err := db.QueryRow(`
		SELECT duration_ms, response_body, request_headers, response_headers
		FROM request_captures WHERE request_id = ?
	`, record.RequestID).Scan(&gotDuration, &gotResponseBody, &gotRequestHeaders, &gotResponseHeaders)
	if err != nil {
		t.Fatalf("read telemetry columns: %v", err)
	}
	if !gotDuration.Valid || gotDuration.Int64 != 42 {
		t.Fatalf("expected duration_ms 42, got %#v", gotDuration)
	}
	if !gotResponseBody.Valid || gotResponseBody.String != body {
		t.Fatalf("expected response_body %q, got %#v", body, gotResponseBody)
	}
	if !gotRequestHeaders.Valid || !strings.Contains(gotRequestHeaders.String, "application/json") {
		t.Fatalf("expected request_headers to contain content-type, got %#v", gotRequestHeaders)
	}
	if !gotResponseHeaders.Valid || !strings.Contains(gotResponseHeaders.String, "application/json") {
		t.Fatalf("expected response_headers to contain content-type, got %#v", gotResponseHeaders)
	}
}

func TestUpsertCaptureNullTelemetryTolerated(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})

	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-no-telemetry"
	record.CapturedAtMS = 1

	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("insert capture: %v", err)
	}

	var (
		gotDuration        sql.NullInt64
		gotResponseBody    sql.NullString
		gotRequestHeaders  sql.NullString
		gotResponseHeaders sql.NullString
	)
	err := db.QueryRow(`
		SELECT duration_ms, response_body, request_headers, response_headers
		FROM request_captures WHERE request_id = ?
	`, record.RequestID).Scan(&gotDuration, &gotResponseBody, &gotRequestHeaders, &gotResponseHeaders)
	if err != nil {
		t.Fatalf("read telemetry columns: %v", err)
	}
	if gotDuration.Valid || gotResponseBody.Valid || gotRequestHeaders.Valid || gotResponseHeaders.Valid {
		t.Fatalf("expected all telemetry columns null, got duration=%#v body=%#v reqHeaders=%#v respHeaders=%#v", gotDuration, gotResponseBody, gotRequestHeaders, gotResponseHeaders)
	}
}

func TestUpsertCapturePreservesArrivalCapturedAtMSOnTerminalUpdate(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})

	arrival := BuildTransportCaptureRecord("req-upsert", 100, "patch", "/api/animes/anime-1", "http")
	if err := store.UpsertCapture(context.Background(), arrival); err != nil {
		t.Fatalf("upsert arrival: %v", err)
	}

	terminal := arrival
	terminal.CapturedAtMS = 999 // must NOT overwrite the arrival's captured_at_ms
	terminal.Outcome = "accepted"
	status := 200
	terminal.HTTPStatus = &status
	duration := int64(42)
	terminal.DurationMS = &duration
	animeID := "anime-1"
	terminal.AnimeID = &animeID
	if err := store.UpsertCapture(context.Background(), terminal); err != nil {
		t.Fatalf("upsert terminal: %v", err)
	}

	if got := countRows(t, db, "request_captures"); got != 1 {
		t.Fatalf("expected exactly one row after arrival+terminal upsert, got %d", got)
	}

	var (
		gotCapturedAtMS int64
		gotOutcome      string
		gotHTTPStatus   sql.NullInt64
		gotDuration     sql.NullInt64
		gotAnimeID      sql.NullString
	)
	err := db.QueryRow(`
		SELECT captured_at_ms, outcome, http_status, duration_ms, anime_id
		FROM request_captures WHERE request_id = ?
	`, "req-upsert").Scan(&gotCapturedAtMS, &gotOutcome, &gotHTTPStatus, &gotDuration, &gotAnimeID)
	if err != nil {
		t.Fatalf("read upserted row: %v", err)
	}
	if gotCapturedAtMS != 100 {
		t.Fatalf("expected captured_at_ms to stay at the arrival value 100, got %d", gotCapturedAtMS)
	}
	if gotOutcome != "accepted" {
		t.Fatalf("expected terminal outcome accepted, got %q", gotOutcome)
	}
	if !gotHTTPStatus.Valid || gotHTTPStatus.Int64 != 200 {
		t.Fatalf("expected http_status 200, got %#v", gotHTTPStatus)
	}
	if !gotDuration.Valid || gotDuration.Int64 != 42 {
		t.Fatalf("expected duration_ms 42, got %#v", gotDuration)
	}
	if !gotAnimeID.Valid || gotAnimeID.String != "anime-1" {
		t.Fatalf("expected anime_id anime-1, got %#v", gotAnimeID)
	}
}

func TestUpsertCaptureInsertsLoneTerminalWithoutPriorArrival(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})

	record := NewCaptureRecord("patch", "device-1")
	record.RequestID = "req-lone-terminal"
	record.CapturedAtMS = 55
	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("upsert lone terminal: %v", err)
	}

	if got := countRows(t, db, "request_captures"); got != 1 {
		t.Fatalf("expected exactly one row for a lone terminal upsert, got %d", got)
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
