package logger

import (
	"encoding/json"
	"testing"
)

func TestMemLoggerRecentRetainsNewestEntriesInOrder(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{Capacity: 2})
	logs.Infof("anime", "first %d", 1)
	logs.Warnf("sync", "second")
	logs.Errorf("api", "third")

	recent := logs.Recent()
	if len(recent) != 2 {
		t.Fatalf("expected 2 retained entries, got %d", len(recent))
	}

	if recent[0].Domain != "sync" || recent[0].Level != "warn" || recent[0].Message != "second" {
		t.Fatalf("unexpected first retained entry: %#v", recent[0])
	}

	if recent[1].Domain != "api" || recent[1].Level != "error" || recent[1].Message != "third" {
		t.Fatalf("unexpected second retained entry: %#v", recent[1])
	}

	if recent[0].Timestamp == "" || recent[1].Timestamp == "" {
		t.Fatal("expected retained entries to include timestamps")
	}
}

func TestMemLoggerRecentReturnsCopy(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{Capacity: 2})
	logs.Infof("anime", "hello")

	first := logs.Recent()
	first[0].Message = "mutated"

	second := logs.Recent()
	if second[0].Message != "hello" {
		t.Fatalf("expected Recent to return a copy, got %#v", second[0])
	}
}

func TestFanoutLoggerWritesToAllTargets(t *testing.T) {
	t.Parallel()

	first := NewMemLogger(MemLoggerConfig{Capacity: 2})
	second := NewMemLogger(MemLoggerConfig{Capacity: 2})
	logs := NewFanoutLogger(first, second)
	logs.Infof("system", "fanout")

	if got := len(first.Recent()); got != 1 {
		t.Fatalf("expected first target to receive entry, got %d", got)
	}
	if got := len(second.Recent()); got != 1 {
		t.Fatalf("expected second target to receive entry, got %d", got)
	}
}

func TestMemLoggerDefaultCapacityIs500(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{})
	if logs.capacity != 500 {
		t.Fatalf("expected default capacity 500, got %d", logs.capacity)
	}
}

func TestMemLoggerDebugfStoresDebugLevel(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{Capacity: 10})
	logs.Debugf("bus", "dispatched %s", "anime.changed")

	recent := logs.Recent()
	if len(recent) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(recent))
	}
	if recent[0].Level != LevelDebug {
		t.Fatalf("expected level %q, got %q", LevelDebug, recent[0].Level)
	}
	if recent[0].Message != "dispatched anime.changed" {
		t.Fatalf("expected formatted message, got %q", recent[0].Message)
	}
}

func TestMemLoggerLogfStoresStructuredFields(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{Capacity: 10})
	logs.Logf("anime", LevelInfo, Fields{
		CorrelationID: "corr-123",
		EntityID:      "anime-42",
		EventType:     "catchup.complete",
		DurationMs:    250,
		Metadata:      map[string]any{"count": 5},
	}, "processed %d entries", 5)

	recent := logs.Recent()
	if len(recent) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(recent))
	}

	e := recent[0]
	if e.CorrelationID != "corr-123" {
		t.Fatalf("expected correlationId %q, got %q", "corr-123", e.CorrelationID)
	}
	if e.EntityID != "anime-42" {
		t.Fatalf("expected entityId %q, got %q", "anime-42", e.EntityID)
	}
	if e.EventType != "catchup.complete" {
		t.Fatalf("expected eventType %q, got %q", "catchup.complete", e.EventType)
	}
	if e.DurationMs != 250 {
		t.Fatalf("expected durationMs %d, got %d", 250, e.DurationMs)
	}
	if e.Metadata["count"] != 5 {
		t.Fatalf("expected metadata count=5, got %v", e.Metadata["count"])
	}
}

func TestLogEntryJSONOmitsEmptyStructuredFields(t *testing.T) {
	t.Parallel()

	entry := LogEntry{
		Timestamp: "2026-01-01T00:00:00Z",
		Domain:    "test",
		Level:     LevelInfo,
		Message:   "hello",
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"correlationId", "entityId", "eventType", "durationMs", "metadata"} {
		if _, ok := raw[field]; ok {
			t.Fatalf("expected %q to be omitted from JSON, got %v", field, raw[field])
		}
	}
}

func TestLogEntryJSONIncludesPopulatedStructuredFields(t *testing.T) {
	t.Parallel()

	entry := LogEntry{
		Timestamp:     "2026-01-01T00:00:00Z",
		Domain:        "anime",
		Level:         LevelInfo,
		Message:       "processed",
		CorrelationID: "corr-abc",
		EntityID:      "anime-1",
		EventType:     "catchup.complete",
		DurationMs:    100,
		Metadata:      map[string]any{"key": "val"},
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"correlationId", "entityId", "eventType", "durationMs", "metadata"} {
		if _, ok := raw[field]; !ok {
			t.Fatalf("expected %q to be present in JSON", field)
		}
	}
}

func TestFanoutLoggerLogfPropagatesStructuredFields(t *testing.T) {
	t.Parallel()

	mem := NewMemLogger(MemLoggerConfig{Capacity: 10})
	logs := NewFanoutLogger(mem)
	logs.Logf("anime", LevelWarn, Fields{
		EntityID:   "anime-99",
		DurationMs: 42,
	}, "slow parse")

	recent := mem.Recent()
	if len(recent) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(recent))
	}
	if recent[0].EntityID != "anime-99" {
		t.Fatalf("expected entityId %q, got %q", "anime-99", recent[0].EntityID)
	}
	if recent[0].DurationMs != 42 {
		t.Fatalf("expected durationMs %d, got %d", 42, recent[0].DurationMs)
	}
}

func TestFanoutLoggerDebugfLevel(t *testing.T) {
	t.Parallel()

	mem := NewMemLogger(MemLoggerConfig{Capacity: 10})
	logs := NewFanoutLogger(mem)
	logs.Debugf("bus", "event dispatched")

	recent := mem.Recent()
	if len(recent) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(recent))
	}
	if recent[0].Level != LevelDebug {
		t.Fatalf("expected level %q, got %q", LevelDebug, recent[0].Level)
	}
}
