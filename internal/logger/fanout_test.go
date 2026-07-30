package logger

import "testing"

// recordingSink is an EntrySink test double that records every entry it
// receives, used to assert fan-out reaches a sink-only target.
type recordingSink struct {
	entries []LogEntry
}

func (s *recordingSink) WriteEntry(entry LogEntry) {
	s.entries = append(s.entries, entry)
}

// TestNewFanoutLoggerWithSinksFansOutToSinkOnlyTarget asserts a target that
// only implements EntrySink (not the full Logger interface) still receives
// every entry written through the fanout.
func TestNewFanoutLoggerWithSinksFansOutToSinkOnlyTarget(t *testing.T) {
	t.Parallel()

	sink := &recordingSink{}
	fanout := NewFanoutLoggerWithSinks(nil, sink)
	fanout.Infof("sync", "hello %s", "world")

	if len(sink.entries) != 1 {
		t.Fatalf("expected sink to receive 1 entry, got %d", len(sink.entries))
	}
	if sink.entries[0].Message != "hello world" {
		t.Fatalf("expected message %q, got %q", "hello world", sink.entries[0].Message)
	}
	if sink.entries[0].Domain != "sync" {
		t.Fatalf("expected domain %q, got %q", "sync", sink.entries[0].Domain)
	}
}

// TestNewFanoutLoggerSignatureUnchangedForLoggerTargets asserts
// NewFanoutLogger keeps its original variadic Logger signature and still
// fans out to every logger target (delegating to the new constructor with
// zero sinks).
func TestNewFanoutLoggerSignatureUnchangedForLoggerTargets(t *testing.T) {
	t.Parallel()

	mem := NewMemLogger(MemLoggerConfig{Capacity: 10})
	fanout := NewFanoutLogger(mem)
	fanout.Warnf("download", "disk low")

	entries := mem.Recent()
	if len(entries) != 1 {
		t.Fatalf("expected mem logger to receive 1 entry, got %d", len(entries))
	}
	if entries[0].Level != LevelWarn {
		t.Fatalf("expected level %q, got %q", LevelWarn, entries[0].Level)
	}
}
