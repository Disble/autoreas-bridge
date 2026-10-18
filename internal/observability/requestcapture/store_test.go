package requestcapture

import (
	"context"
	"database/sql"
	"testing"
)

func TestUpsertCaptureWritesTelemetryColumns(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)

	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-telemetry"
	record.CapturedAtMS = 1
	duration := int64(42)
	requestBody := `{"name":"x","nested":{"n":1},"secret":"keep-me"}`
	body := `{"error":"anime not found"}`
	record.DurationMS = &duration
	record.RequestBody = &requestBody
	record.RequestBodyState = CaptureStateOmittedTooLarge
	record.ResponseBody = &body
	record.ResponseBodyState = CaptureStateTruncated
	record.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	record.ErrorMessage = "anime anime-1 not found"
	record.ClientRequestID = "cycle-1:4"
	record.ResponseHeaders = map[string]string{"Content-Type": "application/json"}

	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("insert capture: %v", err)
	}
	got, err := NewReader(db).Get(context.Background(), record.RequestID)
	if err != nil || got.Item.ErrorMessage != record.ErrorMessage {
		t.Fatalf("error message round trip = %q (%v), want %q", got.Item.ErrorMessage, err, record.ErrorMessage)
	}
	if got.Item.ClientRequestID != record.ClientRequestID {
		t.Fatalf("client request id round trip = %q, want %q", got.Item.ClientRequestID, record.ClientRequestID)
	}

	assertTelemetryRow(t, readTelemetryRow(t, db, record.RequestID), telemetryRow{
		duration:        sql.NullInt64{Int64: 42, Valid: true},
		requestBody:     sql.NullString{String: requestBody, Valid: true},
		requestState:    sql.NullString{String: CaptureStateOmittedTooLarge, Valid: true},
		responseBody:    sql.NullString{String: body, Valid: true},
		responseState:   sql.NullString{String: CaptureStateTruncated, Valid: true},
		requestHeaders:  sql.NullString{String: "application/json", Valid: true},
		responseHeaders: sql.NullString{String: "application/json", Valid: true},
	})
}

func TestUpsertCaptureNullTelemetryTolerated(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)

	record := NewCaptureRecord("patch", "device")
	record.RequestID = "req-no-telemetry"
	record.CapturedAtMS = 1

	if err := store.UpsertCapture(context.Background(), record); err != nil {
		t.Fatalf("insert capture: %v", err)
	}

	assertTelemetryRow(t, readTelemetryRow(t, db, record.RequestID), telemetryRow{
		requestState:  sql.NullString{String: "", Valid: true},
		responseState: sql.NullString{String: "", Valid: true},
	})
}

func TestUpsertCapturePreservesArrivalCapturedAtMSOnTerminalUpdate(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db)

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
	store := NewStore(db)

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
