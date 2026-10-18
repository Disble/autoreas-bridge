package desktop

import (
	"database/sql"
	"reflect"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

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
	value, ok := entry.Metadata[key]
	if !ok || len(entry.Metadata) != 1 {
		t.Fatalf("expected only %q in metadata, got %#v", key, entry.Metadata)
	}
	return value
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
	seedPendingCaptureRow(t, sweptDB, "req-orphan-1", 100)
	seedPendingCaptureRow(t, sweptDB, "req-orphan-2", 110)
	const failed = "failed to sweep orphaned capture rows: "

	t.Run("swept", func(t *testing.T) {
		shared, mem := sweepTestLogger()
		(&App{bridgeDB: sweptDB, sharedLogger: shared}).sweepOrphanedCaptures()
		value := onlySweepWarning(t, mem, "swept 2 orphaned capture row(s) left pending by a previous process", "swept")
		if !reflect.DeepEqual(value, int64(2)) {
			t.Fatalf("expected swept=2, got %#v", value)
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
