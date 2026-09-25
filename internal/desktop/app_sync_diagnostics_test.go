package desktop

import (
	"context"
	"errors"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/telemetry"
)

// telemetryTestEvent builds one already-validated cycle_report event whose
// stored payload carries a distinctive marker token, so a test can prove the
// emitted runtime event identifies the kind, the event and the device without
// dumping the payload. It is hand-built rather than decoded: the seam's
// contract is "already validated", which is exactly what this constructs.
func telemetryTestEvent(cycleID string) telemetry.Event {
	return telemetry.Event{
		DeviceID:     "device-1",
		ReportedAtMS: 1000,
		Kind:         telemetry.KindCycleReport,
		Validated: telemetry.Validated{
			EventID: cycleID,
			Payload: []byte(`{"recent_events":[{"event":"PAYLOAD-MARKER"}]}`),
		},
	}
}

func TestIngestSyncDiagnosticsNilWhenBridgeDBUnset(t *testing.T) {
	t.Parallel()
	app := &App{}
	if app.ingestSyncDiagnostics() != nil {
		t.Fatal("ingestSyncDiagnostics must be nil (route 503) when bridge SQLite is unavailable")
	}
}

// TestIngestSyncDiagnosticsWiredInsertsRow pins the composition root: the seam
// is wired once bridge SQLite exists, and one event written through it lands a
// real row in device_telemetry_events under its own kind. The row is read back
// from the database rather than inferred from the Stored outcome, because a
// Stored outcome proves only that something accepted the write.
func TestIngestSyncDiagnosticsWiredInsertsRow(t *testing.T) {
	t.Parallel()
	app := &App{bridgeDB: captureAppTestDB(t)}

	ingest := app.ingestSyncDiagnostics()
	if ingest == nil {
		t.Fatal("ingestSyncDiagnostics must be non-nil once bridge SQLite is available")
	}

	outcome, err := ingest(context.Background(), telemetryTestEvent("cycle-1"))
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}
	if outcome != telemetry.Stored {
		t.Fatalf("outcome = %v, want Stored", outcome)
	}

	var kind, payload string
	err = app.bridgeDB.QueryRow(
		`SELECT kind, payload_json FROM device_telemetry_events WHERE event_id = ?`, "cycle-1",
	).Scan(&kind, &payload)
	if err != nil {
		t.Fatalf("read the stored telemetry row: %v", err)
	}
	if kind != telemetry.KindCycleReport {
		t.Fatalf("kind = %q, want %q", kind, telemetry.KindCycleReport)
	}
	if payload != string(telemetryTestEvent("cycle-1").Validated.Payload) {
		t.Fatalf("payload_json = %q, want the validated payload", payload)
	}
}

// newSyncDiagnosticsTestApp builds an App whose ingestion seam writes through
// the real telemetry store over a real bridge database, with a shared fan-out
// logger backed by one in-memory logger the test can assert against.
func newSyncDiagnosticsTestApp(t *testing.T) (*App, *sharedlogger.MemLogger) {
	t.Helper()
	db := captureAppTestDB(t)
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := &App{bridgeDB: db, sharedLogger: sharedlogger.NewFanoutLogger(memLogger)}
	return app, memLogger
}

// assertSingleSyncDiagnosticsStoredEvent asserts the in-memory logger holds
// exactly one entry and that it is the sync.diagnostics_stored runtime event:
// sync domain, info level, the event's device as EntityID, a message naming
// the kind, the event and the device, and no trace of the payload.
func assertSingleSyncDiagnosticsStoredEvent(t *testing.T, memLogger *sharedlogger.MemLogger, cycleID string) {
	t.Helper()
	entries := memLogger.Recent()
	if len(entries) != 1 {
		t.Fatalf("expected exactly 1 runtime event, got %d: %#v", len(entries), entries)
	}
	entry := entries[0]
	if entry.Domain != "sync" || entry.Level != sharedlogger.LevelInfo || entry.EventType != "sync.diagnostics_stored" {
		t.Fatalf("unexpected event shape: %#v", entry)
	}
	if entry.EntityID != "device-1" {
		t.Fatalf("expected EntityID to carry the device, got %q", entry.EntityID)
	}
	if !strings.Contains(entry.Message, cycleID) || !strings.Contains(entry.Message, "device-1") {
		t.Fatalf("expected the message to identify the event and the device, got %q", entry.Message)
	}
	if strings.Contains(entry.Message, "PAYLOAD-MARKER") {
		t.Fatalf("expected the message to never dump the payload, got %q", entry.Message)
	}
}

// TestIngestSyncDiagnosticsStoredEmitsExactlyOneEvent delivers one event
// through the real ingestion seam over a real bridge database and asserts the
// outcome is Stored and exactly one sync.diagnostics_stored runtime event is
// emitted with the sync domain, info level, device EntityID and a payload-free
// message.
func TestIngestSyncDiagnosticsStoredEmitsExactlyOneEvent(t *testing.T) {
	t.Parallel()

	app, memLogger := newSyncDiagnosticsTestApp(t)
	ingest := app.ingestSyncDiagnostics()
	if ingest == nil {
		t.Fatal("expected the ingestion seam to be wired for a live bridge database")
	}

	outcome, err := ingest(context.Background(), telemetryTestEvent("cycle-stored"))
	if err != nil {
		t.Fatalf("ingest event: %v", err)
	}
	if outcome != telemetry.Stored {
		t.Fatalf("expected Stored outcome, got %v", outcome)
	}
	assertSingleSyncDiagnosticsStoredEvent(t, memLogger, "cycle-stored")
}

// TestIngestSyncDiagnosticsDuplicateEmitsNoEvent delivers the same event
// twice through the real ingestion seam: the first insert is Stored and emits
// the one allowed event, the second is a Duplicate (same event_id) and must
// emit nothing -- a retry is not new information.
func TestIngestSyncDiagnosticsDuplicateEmitsNoEvent(t *testing.T) {
	t.Parallel()

	app, memLogger := newSyncDiagnosticsTestApp(t)
	ingest := app.ingestSyncDiagnostics()

	first, err := ingest(context.Background(), telemetryTestEvent("cycle-dup"))
	if err != nil {
		t.Fatalf("first ingest: %v", err)
	}
	if first != telemetry.Stored {
		t.Fatalf("expected first insert to be Stored, got %v", first)
	}

	second, err := ingest(context.Background(), telemetryTestEvent("cycle-dup"))
	if err != nil {
		t.Fatalf("second ingest: %v", err)
	}
	if second != telemetry.Duplicate {
		t.Fatalf("expected second insert to be Duplicate, got %v", second)
	}

	assertSingleSyncDiagnosticsStoredEvent(t, memLogger, "cycle-dup")
}

// TestIngestSyncDiagnosticsShedEmitsNoEvent closes the bridge database before
// ingesting, so the store's write fails and the seam reports Shed: the caller
// must never treat it as success, and no runtime event may be emitted -- a
// shed write is not a stored event.
func TestIngestSyncDiagnosticsShedEmitsNoEvent(t *testing.T) {
	t.Parallel()

	app, memLogger := newSyncDiagnosticsTestApp(t)
	ingest := app.ingestSyncDiagnostics()
	if err := app.bridgeDB.Close(); err != nil {
		t.Fatalf("close bridge db: %v", err)
	}

	outcome, err := ingest(context.Background(), telemetryTestEvent("cycle-shed"))
	if outcome != telemetry.Shed {
		t.Fatalf("expected Shed outcome, got %v (err: %v)", outcome, err)
	}
	if len(memLogger.Recent()) != 0 {
		t.Fatalf("expected no runtime event for a Shed event, got %#v", memLogger.Recent())
	}
}

// TestIngestSyncDiagnosticsUndeclaredKindIsRefused pins the composition root's
// guard against a kind the store's registry does not declare: the seam reports
// Shed with telemetry.ErrUndeclaredKind and writes nothing, so a wiring bug
// surfaces as a rejected write instead of a row nothing can ever prune. The
// error is checked with errors.Is because the store wraps it.
func TestIngestSyncDiagnosticsUndeclaredKindIsRefused(t *testing.T) {
	t.Parallel()

	app, memLogger := newSyncDiagnosticsTestApp(t)
	ingest := app.ingestSyncDiagnostics()

	event := telemetryTestEvent("cycle-undeclared")
	event.Kind = "never_registered_kind"
	outcome, err := ingest(context.Background(), event)
	if outcome != telemetry.Shed {
		t.Fatalf("expected Shed outcome, got %v", outcome)
	}
	if !errors.Is(err, telemetry.ErrUndeclaredKind) {
		t.Fatalf("expected ErrUndeclaredKind, got %v", err)
	}

	var rows int
	if err := app.bridgeDB.QueryRow(`SELECT COUNT(*) FROM device_telemetry_events`).Scan(&rows); err != nil {
		t.Fatalf("count telemetry rows: %v", err)
	}
	if rows != 0 {
		t.Fatalf("telemetry rows = %d, want 0 for an undeclared kind", rows)
	}
	if len(memLogger.Recent()) != 0 {
		t.Fatalf("expected no runtime event for a refused kind, got %#v", memLogger.Recent())
	}
}
