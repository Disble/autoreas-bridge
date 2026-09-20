package desktop

import (
	"context"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/syncdiag"
)

func TestIngestSyncDiagnosticsNilWhenBridgeDBUnset(t *testing.T) {
	t.Parallel()
	app := &App{}
	if app.ingestSyncDiagnostics() != nil {
		t.Fatal("ingestSyncDiagnostics must be nil (route 503) when bridge SQLite is unavailable")
	}
}

func TestIngestSyncDiagnosticsWiredInsertsRow(t *testing.T) {
	t.Parallel()
	app := &App{bridgeDB: captureAppTestDB(t)}

	ingest := app.ingestSyncDiagnostics()
	if ingest == nil {
		t.Fatal("ingestSyncDiagnostics must be non-nil once bridge SQLite is available")
	}

	record := syncdiag.Record{
		DeviceID:      "device-1",
		ReportedAtMS:  1000,
		CycleID:       "cycle-1",
		TriggerSource: "foreground_service",
		AppState:      "background",
		RecentEvents:  []syncdiag.RecentEvent{},
	}
	outcome, err := ingest(context.Background(), record)
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}
	if outcome != syncdiag.Stored {
		t.Fatalf("outcome = %v, want Stored", outcome)
	}
}

// syncDiagnosticsTestRecord builds one minimal diagnostics report whose
// recent-events payload carries a distinctive marker token, so a test can
// prove the emitted event's message identifies the cycle and the device
// without dumping the payload.
func syncDiagnosticsTestRecord(cycleID string) syncdiag.Record {
	return syncdiag.Record{
		DeviceID:                  "device-1",
		ReportedAtMS:              1000,
		CycleID:                   cycleID,
		TriggerSource:             "foreground_service",
		AppState:                  "background",
		ConsecutiveUnclosedCycles: 1,
		PendingOpsCount:           3,
		Cursor:                    42,
		RecentEvents: []syncdiag.RecentEvent{{
			Source:  "alarm",
			Event:   "PAYLOAD-MARKER",
			FirstAt: 900,
			LastAt:  950,
			Count:   2,
		}},
	}
}

// newSyncDiagnosticsTestApp builds an App whose ingestion seam writes through
// the real syncdiag store over a real bridge database, with a shared fan-out
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
// sync domain, info level, the report's device as EntityID, a message naming
// the cycle and the device, and no trace of the report's payload.
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
		t.Fatalf("expected the message to identify the cycle and the device, got %q", entry.Message)
	}
	if strings.Contains(entry.Message, "PAYLOAD-MARKER") {
		t.Fatalf("expected the message to never dump the payload, got %q", entry.Message)
	}
}

// TestIngestSyncDiagnosticsStoredEmitsExactlyOneEvent delivers one report
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

	outcome, err := ingest(context.Background(), syncDiagnosticsTestRecord("cycle-stored"))
	if err != nil {
		t.Fatalf("ingest report: %v", err)
	}
	if outcome != syncdiag.Stored {
		t.Fatalf("expected Stored outcome, got %v", outcome)
	}
	assertSingleSyncDiagnosticsStoredEvent(t, memLogger, "cycle-stored")
}

// TestIngestSyncDiagnosticsDuplicateEmitsNoEvent delivers the same report
// twice through the real ingestion seam: the first insert is Stored and emits
// the one allowed event, the second is a Duplicate (same cycle_id) and must
// emit nothing -- a retry is not new information.
func TestIngestSyncDiagnosticsDuplicateEmitsNoEvent(t *testing.T) {
	t.Parallel()

	app, memLogger := newSyncDiagnosticsTestApp(t)
	ingest := app.ingestSyncDiagnostics()

	first, err := ingest(context.Background(), syncDiagnosticsTestRecord("cycle-dup"))
	if err != nil {
		t.Fatalf("first ingest: %v", err)
	}
	if first != syncdiag.Stored {
		t.Fatalf("expected first insert to be Stored, got %v", first)
	}

	second, err := ingest(context.Background(), syncDiagnosticsTestRecord("cycle-dup"))
	if err != nil {
		t.Fatalf("second ingest: %v", err)
	}
	if second != syncdiag.Duplicate {
		t.Fatalf("expected second insert to be Duplicate, got %v", second)
	}

	assertSingleSyncDiagnosticsStoredEvent(t, memLogger, "cycle-dup")
}

// TestIngestSyncDiagnosticsShedEmitsNoEvent closes the bridge database before
// ingesting, so the store's write fails and the seam reports Shed: the caller
// must never treat it as success, and no runtime event may be emitted -- a
// shed write is not a stored report.
func TestIngestSyncDiagnosticsShedEmitsNoEvent(t *testing.T) {
	t.Parallel()

	app, memLogger := newSyncDiagnosticsTestApp(t)
	ingest := app.ingestSyncDiagnostics()
	if err := app.bridgeDB.Close(); err != nil {
		t.Fatalf("close bridge db: %v", err)
	}

	outcome, err := ingest(context.Background(), syncDiagnosticsTestRecord("cycle-shed"))
	if outcome != syncdiag.Shed {
		t.Fatalf("expected Shed outcome, got %v (err: %v)", outcome, err)
	}
	if len(memLogger.Recent()) != 0 {
		t.Fatalf("expected no runtime event for a Shed report, got %#v", memLogger.Recent())
	}
}
