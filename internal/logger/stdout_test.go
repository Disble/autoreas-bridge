package logger

import (
	"bytes"
	"strings"
	"testing"
)

func TestStdoutLoggerIncludesTimestampLevelAndDomain(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Infof("anime", "updated %s", "Bleach")

	got := strings.TrimSpace(buffer.String())

	// Format: <ISO-8601> [INFO] [anime] updated Bleach
	if !strings.Contains(got, "[INFO]") {
		t.Fatalf("expected [INFO] in output, got %q", got)
	}
	if !strings.Contains(got, "[anime]") {
		t.Fatalf("expected [anime] in output, got %q", got)
	}
	if !strings.Contains(got, "updated Bleach") {
		t.Fatalf("expected message in output, got %q", got)
	}
	// ISO-8601 timestamp starts with year
	if !strings.HasPrefix(got, "20") {
		t.Fatalf("expected ISO-8601 timestamp prefix, got %q", got)
	}
}

func TestStdoutLoggerDebugLevel(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Debugf("bus", "event dispatched")

	got := strings.TrimSpace(buffer.String())
	if !strings.Contains(got, "[DEBUG]") {
		t.Fatalf("expected [DEBUG] in output, got %q", got)
	}
	if !strings.Contains(got, "[bus]") {
		t.Fatalf("expected [bus] in output, got %q", got)
	}
}

func TestStdoutLoggerLogfWithStructuredFields(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Logf("anime", LevelInfo, Fields{
		EntityID:   "anime-42",
		DurationMs: 150,
		EventType:  "catchup.complete",
	}, "processed %d entries", 5)

	got := strings.TrimSpace(buffer.String())

	if !strings.Contains(got, "entityId=anime-42") {
		t.Fatalf("expected entityId suffix, got %q", got)
	}
	if !strings.Contains(got, "durationMs=150") {
		t.Fatalf("expected durationMs suffix, got %q", got)
	}
	if !strings.Contains(got, "eventType=catchup.complete") {
		t.Fatalf("expected eventType suffix, got %q", got)
	}
	if !strings.Contains(got, "processed 5 entries") {
		t.Fatalf("expected formatted message, got %q", got)
	}
}

func TestStdoutLoggerOmitsEmptyStructuredFields(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Logf("sync", LevelWarn, Fields{}, "reconcile slow")

	got := strings.TrimSpace(buffer.String())
	if strings.Contains(got, "entityId=") || strings.Contains(got, "durationMs=") {
		t.Fatalf("expected no metadata suffixes for empty fields, got %q", got)
	}
}

func TestStdoutLoggerCorrelationIDSuffix(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Logf("anime", LevelInfo, Fields{
		CorrelationID: "corr-abc-123",
	}, "delta detected")

	got := strings.TrimSpace(buffer.String())
	if !strings.Contains(got, "correlationId=corr-abc-123") {
		t.Fatalf("expected correlationId suffix, got %q", got)
	}
}
