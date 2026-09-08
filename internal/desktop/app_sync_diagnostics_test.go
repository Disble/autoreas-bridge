package desktop

import (
	"context"
	"testing"

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
