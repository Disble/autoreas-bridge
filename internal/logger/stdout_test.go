package logger

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

// TestStdoutLoggerWritesTimestampLevelDomainMessageAndOnlyPopulatedFields
// writes one line per level and field shape through one logger and checks each
// line: a millisecond UTC timestamp, the level and domain tags, the formatted
// message, a suffix per populated structured field, and no suffix for an empty
// field.
func TestStdoutLoggerWritesTimestampLevelDomainMessageAndOnlyPopulatedFields(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Infof("anime", "updated %s", "Bleach")
	logs.Debugf("bus", "event dispatched")
	logs.Logf("anime", LevelInfo, Fields{EntityID: "anime-42", DurationMs: 150, EventType: "catchup.complete"}, "processed %d entries", 5)
	logs.Logf("sync", LevelWarn, Fields{}, "reconcile slow")
	logs.Logf("anime", LevelInfo, Fields{CorrelationID: "corr-abc-123"}, "delta detected")

	lines := strings.Split(strings.TrimSpace(buffer.String()), "\n")
	if len(lines) != 5 {
		t.Fatalf("expected 5 lines, got %d: %q", len(lines), lines)
	}
	// Format: <ISO-8601> [INFO] [anime] updated Bleach. The timestamp leads the
	// line with millisecond resolution (P2), so events inside one second keep
	// their order.
	assertLineContains(t, lines[0], "[INFO]", "[anime]", "updated Bleach")
	stamp, _, _ := strings.Cut(lines[0], " ")
	if _, err := time.Parse(TimestampLayout, stamp); err != nil || len(stamp) != len("2006-01-02T15:04:05.000Z") {
		t.Fatalf("expected a millisecond UTC timestamp prefix, got %q (%v)", stamp, err)
	}
	assertLineContains(t, lines[1], "[DEBUG]", "[bus]")
	assertLineContains(t, lines[2], "entityId=anime-42", "durationMs=150", "eventType=catchup.complete", "processed 5 entries")
	if strings.Contains(lines[3], "entityId=") || strings.Contains(lines[3], "durationMs=") {
		t.Fatalf("expected no metadata suffixes for empty fields, got %q", lines[3])
	}
	assertLineContains(t, lines[4], "correlationId=corr-abc-123")
}

// assertLineContains fails when line misses any of the wanted fragments.
func assertLineContains(t *testing.T, line string, wanted ...string) {
	t.Helper()

	for _, want := range wanted {
		if !strings.Contains(line, want) {
			t.Fatalf("expected %q in output, got %q", want, line)
		}
	}
}
