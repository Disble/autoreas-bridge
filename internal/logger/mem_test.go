package logger

import "testing"

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
