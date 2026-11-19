package logger

import "testing"

// TestMemLoggerStoresDebugAndStructuredEntriesAndRecentReturnsACopy logs a
// debug line and a structured line into one memory logger, checks each entry's
// level, message and fields, and checks mutating what Recent returned leaves
// the stored entries intact.
func TestMemLoggerStoresDebugAndStructuredEntriesAndRecentReturnsACopy(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{Capacity: 10})
	logs.Debugf("bus", "dispatched %s", "anime.changed")
	logs.Logf("anime", LevelInfo, Fields{
		CorrelationID: "corr-123",
		EntityID:      "anime-42",
		EventType:     "catchup.complete",
		DurationMs:    250,
		Metadata:      map[string]any{"count": 5},
	}, "processed %d entries", 5)

	recent := logs.Recent()
	if len(recent) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(recent))
	}
	if recent[0].Level != LevelDebug || recent[0].Message != "dispatched anime.changed" {
		t.Fatalf("expected a formatted debug entry, got %#v", recent[0])
	}
	e := recent[1]
	if e.CorrelationID != "corr-123" || e.EntityID != "anime-42" || e.EventType != "catchup.complete" || e.DurationMs != 250 || e.Metadata["count"] != 5 {
		t.Fatalf("expected every structured field stored, got %#v", e)
	}

	recent[0].Message = "mutated"
	if again := logs.Recent(); again[0].Message != "dispatched anime.changed" {
		t.Fatalf("expected Recent to return a copy, got %#v", again[0])
	}
}

// TestFanoutLoggerWritesEveryLevelAndFieldToAllTargets writes an info line, a
// structured warning and a debug line through a fanout over two memory loggers
// and checks both receive each entry with its level and fields.
func TestFanoutLoggerWritesEveryLevelAndFieldToAllTargets(t *testing.T) {
	t.Parallel()

	first := NewMemLogger(MemLoggerConfig{Capacity: 10})
	second := NewMemLogger(MemLoggerConfig{Capacity: 10})
	logs := NewFanoutLogger(first, second)
	logs.Infof("system", "fanout")
	logs.Logf("anime", LevelWarn, Fields{EntityID: "anime-99", DurationMs: 42}, "slow parse")
	logs.Debugf("bus", "event dispatched")

	for name, target := range map[string]*MemLogger{"first": first, "second": second} {
		recent := target.Recent()
		if len(recent) != 3 {
			t.Fatalf("expected %s target to receive 3 entries, got %d", name, len(recent))
		}
		if recent[0].Message != "fanout" {
			t.Fatalf("expected %s target to receive the info entry, got %#v", name, recent[0])
		}
		if recent[1].EntityID != "anime-99" || recent[1].DurationMs != 42 {
			t.Fatalf("expected %s target to receive the structured fields, got %#v", name, recent[1])
		}
		if recent[2].Level != LevelDebug {
			t.Fatalf("expected %s target to receive level %q, got %q", name, LevelDebug, recent[2].Level)
		}
	}
}
