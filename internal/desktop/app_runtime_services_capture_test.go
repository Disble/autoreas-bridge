package desktop

import (
	"database/sql"
	"fmt"
	"reflect"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// newAppWithMemLogger builds an app whose shared logger records into a
// MemLogger, so a test can assert what the wiring told the operator.
func newAppWithMemLogger(app *App) (*App, *sharedlogger.MemLogger) {
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)
	return app, memLogger
}

// warnEntries returns the entries the in-memory sink recorded at warn level.
func warnEntries(mem *sharedlogger.MemLogger) []sharedlogger.LogEntry {
	entries := []sharedlogger.LogEntry{}
	for _, entry := range mem.Recent() {
		if entry.Level == sharedlogger.LevelWarn {
			entries = append(entries, entry)
		}
	}
	return entries
}

// onlySweepWarning asserts the sink holds exactly one api.capture_swept warning whose message
// starts with wantMessage and whose metadata holds key alone, and returns that value.
func onlySweepWarning(t *testing.T, mem *sharedlogger.MemLogger, wantMessage, key string) any {
	t.Helper()
	entry := onlySweepEntry(t, mem, wantMessage)
	value, ok := entry.Metadata[key]
	if !ok || len(entry.Metadata) != 1 {
		t.Fatalf("expected only %q in metadata, got %#v", key, entry.Metadata)
	}
	return value
}

// onlySweepEntry asserts the sink holds exactly one api.capture_swept warning whose message
// starts with wantMessage, and returns it.
func onlySweepEntry(t *testing.T, mem *sharedlogger.MemLogger, wantMessage string) sharedlogger.LogEntry {
	t.Helper()
	entries := warnEntries(mem)
	if len(entries) != 1 {
		t.Fatalf("expected exactly one warning, got %#v", entries)
	}
	entry := entries[0]
	if entry.Domain != "api" || entry.EventType != "api.capture_swept" {
		t.Fatalf("expected domain api and event api.capture_swept, got %q/%q", entry.Domain, entry.EventType)
	}
	if !strings.HasPrefix(entry.Message, wantMessage) {
		t.Fatalf("expected message to start with %q, got %q", wantMessage, entry.Message)
	}
	return entry
}

// TestSweepOrphanedCapturesRecordsDiagnosableMetadata pins the structured fields every sweep
// warning carries, so a kept ledger row says how many rows were swept or why the sweep failed
// without parsing the message.
func TestSweepOrphanedCapturesRecordsDiagnosableMetadata(t *testing.T) {
	t.Parallel()

	closedDB := captureAppTestDB(t)
	if err := closedDB.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	sweptDB := captureAppTestDB(t)
	seedPendingCaptureRow(t, sweptDB, "req-orphan-2", 110)
	seedPendingCaptureRow(t, sweptDB, "req-orphan-1", 100)
	if _, err := sweptDB.Exec(`UPDATE request_captures SET client_request_id = 'cycle-9:1' WHERE request_id = 'req-orphan-2'`); err != nil {
		t.Fatalf("set client request id: %v", err)
	}
	const failed = "failed to sweep orphaned capture rows: "

	t.Run("swept", func(t *testing.T) {
		shared, mem := sweepTestLogger()
		(&App{bridgeDB: sweptDB, sharedLogger: shared}).sweepOrphanedCaptures()
		entry := onlySweepEntry(t, mem, "swept 2 orphaned capture row(s) left pending by a previous process")
		want := map[string]any{
			"swept": int64(2),
			"captures": []map[string]any{
				{"requestId": "req-orphan-1", "route": "/api/seasons/active", "kind": "get", "capturedAtMs": int64(100)},
				{"requestId": "req-orphan-2", "route": "/api/seasons/active", "kind": "get", "capturedAtMs": int64(110), "clientRequestId": "cycle-9:1"},
			},
		}
		if !reflect.DeepEqual(entry.Metadata, want) {
			t.Fatalf("expected metadata %#v, got %#v", want, entry.Metadata)
		}
	})

	t.Run("error", func(t *testing.T) {
		shared, mem := sweepTestLogger()
		(&App{bridgeDB: closedDB, sharedLogger: shared}).sweepOrphanedCaptures()
		if cause, ok := onlySweepWarning(t, mem, failed, "cause").(string); !ok || !strings.Contains(cause, "closed") {
			t.Fatalf("expected the closed-database error as cause, got %#v", cause)
		}
	})

	t.Run("panic", func(t *testing.T) {
		shared, mem := sweepTestLogger()
		(&App{bridgeDB: &sql.DB{}, sharedLogger: shared}).sweepOrphanedCaptures()
		if cause, ok := onlySweepWarning(t, mem, failed, "cause").(string); !ok || cause == "" {
			t.Fatalf("expected the recovered value as a non-empty cause, got %#v", cause)
		}
	})
}

// TestSweepOrphanedCapturesNamesOnlyTheNewestRows pins the bound on the named rows: the newest
// are kept, because the last request before a hang is the one that matters, and the rest are
// counted.
func TestSweepOrphanedCapturesNamesOnlyTheNewestRows(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	for i := range maxSweptCapturesLogged + 1 {
		seedPendingCaptureRow(t, db, fmt.Sprintf("req-%02d", i), int64(1000+i))
	}
	shared, mem := sweepTestLogger()

	(&App{bridgeDB: db, sharedLogger: shared}).sweepOrphanedCaptures()

	entry := onlySweepEntry(t, mem, fmt.Sprintf("swept %d orphaned", maxSweptCapturesLogged+1))
	captures, ok := entry.Metadata["captures"].([]map[string]any)
	if !ok || len(captures) != maxSweptCapturesLogged {
		t.Fatalf("expected %d captures, got %#v", maxSweptCapturesLogged, entry.Metadata["captures"])
	}
	if captures[0]["requestId"] != "req-01" || entry.Metadata["capturesOmitted"] != 1 {
		t.Fatalf("expected the oldest one omitted, got first %#v and omitted %#v", captures[0], entry.Metadata["capturesOmitted"])
	}
}
