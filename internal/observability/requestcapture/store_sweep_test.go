package requestcapture

import (
	"context"
	"database/sql"
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

func TestSweepOrphanedCapturesMarksPendingArrivalAbandoned(t *testing.T) {
	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	storePendingArrival(t, store, "req-orphan", 1_700_000_000_000)

	swept, err := SweepOrphanedCaptures(context.Background(), db)
	if err != nil {
		t.Fatalf("sweep orphaned captures: %v", err)
	}

	if swept != 1 {
		t.Fatalf("expected 1 swept orphan, got %d", swept)
	}
	outcome, status, duration := readOutcomeRow(t, db, "req-orphan")
	if outcome != OutcomeAbandoned {
		t.Fatalf("expected swept orphan outcome %q, got %q", OutcomeAbandoned, outcome)
	}
	if status.Valid {
		t.Fatalf("expected swept orphan to keep a NULL http_status, got %#v", status)
	}
	if duration.Valid {
		t.Fatalf("expected swept orphan to keep a NULL duration_ms, got %#v", duration)
	}
}

func TestSweepOrphanedCapturesLeavesTerminalRowsUntouched(t *testing.T) {
	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
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

	if swept != 0 {
		t.Fatalf("expected no swept orphans, got %d", swept)
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
}

func TestSweepOrphanedCapturesIsIdempotent(t *testing.T) {
	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	storePendingArrival(t, store, "req-orphan", 1_700_000_000_000)

	if _, err := SweepOrphanedCaptures(context.Background(), db); err != nil {
		t.Fatalf("first sweep: %v", err)
	}
	swept, err := SweepOrphanedCaptures(context.Background(), db)
	if err != nil {
		t.Fatalf("second sweep: %v", err)
	}

	if swept != 0 {
		t.Fatalf("expected the second sweep to find nothing, got %d", swept)
	}
}

func TestSweepOrphanedCapturesRejectsNilDB(t *testing.T) {
	if _, err := SweepOrphanedCaptures(context.Background(), nil); err == nil {
		t.Fatal("expected a nil database handle to be rejected")
	}
}
