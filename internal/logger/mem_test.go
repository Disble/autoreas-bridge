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

func TestMemLoggerDefaultCapacityIs500(t *testing.T) {
	t.Parallel()

	logs := NewMemLogger(MemLoggerConfig{})
	if logs.capacity != 500 {
		t.Fatalf("expected default capacity 500, got %d", logs.capacity)
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
