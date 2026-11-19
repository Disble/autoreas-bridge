package requestcapture

import (
	"context"
	"database/sql"
	"reflect"
	"testing"
)

// readOutcomeRow loads the outcome plus the two terminal-only telemetry columns
// for one capture, so a sweep assertion can prove it rewrote the outcome
// WITHOUT fabricating a status or duration the bridge never observed.
func readOutcomeRow(t *testing.T, db *sql.DB, id string) (string, sql.NullInt64, sql.NullInt64) {
	t.Helper()

	var (
		outcome  string
		status   sql.NullInt64
		duration sql.NullInt64
	)
	err := db.QueryRow(`SELECT outcome, http_status, duration_ms FROM request_captures WHERE request_id = ?`, id).
		Scan(&outcome, &status, &duration)
	if err != nil {
		t.Fatalf("read outcome row for %s: %v", id, err)
	}
	return outcome, status, duration
}

// storePendingArrival persists the transport-only arrival shape the capture
// middleware writes before a handler runs.
func storePendingArrival(t *testing.T, store *SQLiteStore, id string, capturedAtMS int64) {
	t.Helper()

	arrival := BuildTransportCaptureRecord(id, capturedAtMS, "get", "/api/seasons/active", "http")
	if err := store.UpsertCapture(context.Background(), arrival); err != nil {
		t.Fatalf("store pending arrival %s: %v", id, err)
	}
}

func TestSweepOrphanedCapturesRejectsNilDB(t *testing.T) {
	if _, err := SweepOrphanedCaptures(context.Background(), nil); err == nil {
		t.Fatal("expected a nil database handle to be rejected")
	}
}

// TestSweepOrphanedCapturesAbandonsOnlyPendingArrivalsOnce drives one store:
// the sweep marks every pending arrival abandoned, oldest first, leaves a
// terminal row untouched, and a second sweep finds nothing.
func TestSweepOrphanedCapturesAbandonsOnlyPendingArrivalsOnce(t *testing.T) {
	db := openCaptureTestDB(t)
	store := NewStore(db)
	reconcile := BuildTransportCaptureRecord("req-orphan", 1_700_000_000_500, "reconcile", "/api/sync/reconcile", "http")
	reconcile.ClientRequestID = "cycle-1:2"
	if err := store.UpsertCapture(context.Background(), reconcile); err != nil {
		t.Fatalf("store pending reconcile arrival: %v", err)
	}
	storePendingArrival(t, store, "req-older", 1_700_000_000_000)
	status := 404
	duration := int64(7)
	terminal := BuildTransportCaptureRecord("req-terminal", 1_700_000_000_000, "get", "/api/seasons/active", "http")
	terminal.Outcome = "completed"
	terminal.HTTPStatus = &status
	terminal.DurationMS = &duration
	if err := store.UpsertCapture(context.Background(), terminal); err != nil {
		t.Fatalf("store terminal capture: %v", err)
	}

	swept, err := SweepOrphanedCaptures(context.Background(), db)
	if err != nil {
		t.Fatalf("sweep orphaned captures: %v", err)
	}

	// Oldest first, each naming the request a previous process never finished.
	want := []SweptCapture{
		{RequestID: "req-older", Route: "/api/seasons/active", Kind: "get", CapturedAtMS: 1_700_000_000_000},
		{RequestID: "req-orphan", Route: "/api/sync/reconcile", Kind: "reconcile", CapturedAtMS: 1_700_000_000_500, ClientRequestID: "cycle-1:2"},
	}
	if !reflect.DeepEqual(swept, want) {
		t.Fatalf("expected swept captures %#v, got %#v", want, swept)
	}
	outcome, orphanStatus, orphanDuration := readOutcomeRow(t, db, "req-orphan")
	if outcome != OutcomeAbandoned {
		t.Fatalf("expected swept orphan outcome %q, got %q", OutcomeAbandoned, outcome)
	}
	if orphanStatus.Valid {
		t.Fatalf("expected swept orphan to keep a NULL http_status, got %#v", orphanStatus)
	}
	if orphanDuration.Valid {
		t.Fatalf("expected swept orphan to keep a NULL duration_ms, got %#v", orphanDuration)
	}
	gotOutcome, gotStatus, gotDuration := readOutcomeRow(t, db, "req-terminal")
	if gotOutcome != "completed" {
		t.Fatalf("expected terminal outcome preserved, got %q", gotOutcome)
	}
	if !gotStatus.Valid || gotStatus.Int64 != 404 {
		t.Fatalf("expected terminal http_status 404 preserved, got %#v", gotStatus)
	}
	if !gotDuration.Valid || gotDuration.Int64 != 7 {
		t.Fatalf("expected terminal duration_ms 7 preserved, got %#v", gotDuration)
	}

	again, err := SweepOrphanedCaptures(context.Background(), db)
	if err != nil {
		t.Fatalf("second sweep: %v", err)
	}
	if len(again) != 0 {
		t.Fatalf("expected the second sweep to find nothing, got %#v", again)
	}
}
