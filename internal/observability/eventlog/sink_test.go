package eventlog

import (
	"context"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
)

// TestSinkDropsWhenQueueUnbound asserts an unbound sink drops every entry and
// counts it via UnboundDrops.
func TestSinkDropsWhenQueueUnbound(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	if got := sink.UnboundDrops(); got != 1 {
		t.Fatalf("expected UnboundDrops 1, got %d", got)
	}
	if got := sink.DroppedTotal(); got != 1 {
		t.Fatalf("expected DroppedTotal 1, got %d", got)
	}
}

// TestSinkDropsDebugByDefault asserts debug entries are dropped when
// PersistDebug is false (the default).
func TestSinkDropsDebugByDefault(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelDebug, Message: "debug line", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	if got := sink.FilteredDrops(); got != 1 {
		t.Fatalf("expected FilteredDrops 1, got %d", got)
	}
}

// TestSinkPersistsDebugWhenEnabled asserts debug entries enqueue when
// PersistDebug is true.
func TestSinkPersistsDebugWhenEnabled(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink.Bind(queue, true)
	defer func() { _ = queue.Stop(context.Background()) }()

	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelDebug, Message: "debug line", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	if got := sink.FilteredDrops(); got != 0 {
		t.Fatalf("expected FilteredDrops 0, got %d", got)
	}
	waitForRecords(t, store, 1)
}

// TestSinkPersistsInfoWarnErrorAlways asserts non-debug levels are never
// filtered regardless of PersistDebug.
func TestSinkPersistsInfoWarnErrorAlways(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 8})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	for _, level := range []string{sharedlogger.LevelInfo, sharedlogger.LevelWarn, sharedlogger.LevelError} {
		sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: level, Message: level, Timestamp: time.Now().UTC().Format(time.RFC3339)})
	}
	if got := sink.FilteredDrops(); got != 0 {
		t.Fatalf("expected FilteredDrops 0, got %d", got)
	}
	waitForRecords(t, store, 3)
}

// TestSinkConvertsRFC3339TimestampToEpochMillis asserts the sink parses the
// entry's RFC3339 timestamp into OccurredAtMS.
func TestSinkConvertsRFC3339TimestampToEpochMillis(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	stamp := time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC)
	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: stamp.Format(time.RFC3339)})

	record := waitForRecords(t, store, 1)[0]
	if record.OccurredAtMS != stamp.UnixMilli() {
		t.Fatalf("expected occurred_at_ms %d, got %d", stamp.UnixMilli(), record.OccurredAtMS)
	}
}

// TestSinkFallsBackToInjectedNowOnUnparsableTimestamp asserts an unparsable
// timestamp falls back to the injected Now() clock rather than erroring.
func TestSinkFallsBackToInjectedNowOnUnparsableTimestamp(t *testing.T) {
	t.Parallel()

	fixed := int64(1700000000123)
	sink := NewSink(SinkConfig{Now: func() int64 { return fixed }})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: "not-a-timestamp"})

	record := waitForRecords(t, store, 1)[0]
	if record.OccurredAtMS != fixed {
		t.Fatalf("expected fallback occurred_at_ms %d, got %d", fixed, record.OccurredAtMS)
	}
}

// TestSinkBindsNullDurationForZero asserts a zero DurationMs is treated as
// unset (0 is preserved in the EventRecord; the store binds it as NULL --
// this test asserts the sink passes 0 through unchanged, leaving the
// NULL-vs-zero decision to the store).
func TestSinkBindsNullDurationForZero(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: time.Now().UTC().Format(time.RFC3339), DurationMs: 0})

	record := waitForRecords(t, store, 1)[0]
	if record.DurationMS != 0 {
		t.Fatalf("expected duration_ms 0, got %d", record.DurationMS)
	}
}

// TestSinkWriteEntryDoesNotBlockOnDeliberatelySlowStore is the spec's "A slow
// store never delays the caller" and "Overflow drops instead of stalling" in
// one seam: bind a queue over a store that blocks on an unbuffered channel,
// saturate queue capacity, assert every WriteEntry returns inside a hard
// deadline and DroppedTotal() > 0.
func TestSinkWriteEntryDoesNotBlockOnDeliberatelySlowStore(t *testing.T) {
	t.Parallel()

	store := &blockingSinkStore{release: make(chan struct{})}
	queue := NewQueue(store, QueueConfig{Capacity: 1})
	defer func() {
		close(store.release)
		_ = queue.Stop(context.Background())
	}()

	sink := NewSink(SinkConfig{})
	sink.Bind(queue, true)

	done := make(chan struct{})
	go func() {
		for i := 0; i < 50; i++ {
			sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: time.Now().UTC().Format(time.RFC3339)})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("expected WriteEntry calls to never block on a slow store")
	}
	if sink.DroppedTotal() == 0 {
		t.Fatal("expected overflow drops to be counted")
	}
}

// TestSinkUnbindStopsEnqueueBeforeQueueStop asserts Unbind takes effect
// immediately: no further entry is enqueued into the (about to be) closing
// queue.
func TestSinkUnbindStopsEnqueueBeforeQueueStop(t *testing.T) {
	t.Parallel()

	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink := NewSink(SinkConfig{})
	sink.Bind(queue, false)

	sink.Unbind()
	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "after unbind", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	if got := sink.UnboundDrops(); got != 1 {
		t.Fatalf("expected UnboundDrops 1 after Unbind, got %d", got)
	}
	_ = queue.Stop(context.Background())
	if len(store.records) != 0 {
		t.Fatalf("expected no records persisted after Unbind, got %#v", store.records)
	}
}

// recordingSinkStore is a Store test double that records every inserted
// event, guarded by a channel-free simple approach (single drain goroutine,
// so no extra locking is needed for the assertions above).
type recordingSinkStore struct {
	records []EventRecord
}

func (s *recordingSinkStore) InsertEvent(ctx context.Context, record EventRecord) error {
	s.records = append(s.records, record)
	return nil
}

// blockingSinkStore blocks every InsertEvent on an unbuffered release
// channel, used to prove the sink/queue never stalls the caller.
type blockingSinkStore struct {
	release chan struct{}
}

func (s *blockingSinkStore) InsertEvent(ctx context.Context, record EventRecord) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-s.release:
		return nil
	}
}

// waitForRecords polls store.records until it reaches the expected count or
// times out, avoiding a fixed sleep for the single-serialized drain
// goroutine to catch up.
func waitForRecords(t *testing.T, store *recordingSinkStore, want int) []EventRecord {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(store.records) >= want {
			return store.records
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d records, got %d", want, len(store.records))
	return nil
}
