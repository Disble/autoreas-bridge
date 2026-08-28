package eventlog

import (
	"context"
	"testing"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/testsupport/async"
)

// TestSinkBuffersPreBindEntriesAndFlushesOnBind asserts entries written
// before the queue exists are held in the bounded pre-bind buffer and
// delivered by Bind, rather than discarded. Startup emits before bridgeDB is
// bootstrapped -- the whole tracer-bullet flow lands there -- so dropping
// that window made the persisted event log disagree with the in-memory one
// the UI reads. See docs/mcp-event-visibility-report.md.
func TestSinkBuffersPreBindEntriesAndFlushesOnBind(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	for _, message := range []string{"tracer bullet ready", "publishing anime.changed", "received anime.changed"} {
		sink.WriteEntry(sharedlogger.LogEntry{Domain: "system", Level: sharedlogger.LevelInfo, Message: message, Timestamp: time.Now().UTC().Format(time.RFC3339)})
	}
	if got := sink.UnboundDrops(); got != 0 {
		t.Fatalf("expected buffered pre-bind entries not to count as drops, got %d", got)
	}

	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 8})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	records := waitForRecords(t, store, 3)
	if records[0].Message != "tracer bullet ready" {
		t.Fatalf("expected pre-bind entries flushed in emission order, got %q first", records[0].Message)
	}
}

// TestSinkPreBindBufferOverflowCountsUnboundDrops asserts the pre-bind buffer
// is bounded: once full it drops and counts, so a Bind that never arrives
// (failed database bootstrap) cannot grow the buffer without limit.
func TestSinkPreBindBufferOverflowCountsUnboundDrops(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	overflow := 5
	for i := 0; i < preBindBufferCapacity+overflow; i++ {
		sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	}

	if got := sink.UnboundDrops(); got != int64(overflow) {
		t.Fatalf("expected UnboundDrops %d once the buffer is full, got %d", overflow, got)
	}
	if got := sink.DroppedTotal(); got != int64(overflow) {
		t.Fatalf("expected DroppedTotal %d, got %d", overflow, got)
	}
}

// TestSinkAppliesDebugPolicyWhenFlushingPreBindBuffer asserts the level
// filter runs at flush time, not at buffer time: PersistDebug is only known
// once Bind supplies it, so a debug entry buffered during startup must still
// be filtered when the policy turns out to be off.
func TestSinkAppliesDebugPolicyWhenFlushingPreBindBuffer(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	sink.WriteEntry(sharedlogger.LogEntry{Domain: "bus", Level: sharedlogger.LevelDebug, Message: "publish anime.changed", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "received anime.changed", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 8})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	records := waitForRecords(t, store, 1)
	if len(records) != 1 || records[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected only the info entry to survive the flush, got %#v", records)
	}
	if got := sink.FilteredDrops(); got != 1 {
		t.Fatalf("expected FilteredDrops 1 for the buffered debug entry, got %d", got)
	}
}

// TestSinkDropsAfterUnbindWithoutBuffering asserts the pre-bind buffer is a
// startup-only affordance. After Unbind (shutdown) a nil queue must drop, not
// re-buffer -- otherwise every entry logged during shutdown would accumulate
// in a buffer nothing will ever flush.
func TestSinkDropsAfterUnbindWithoutBuffering(t *testing.T) {
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
		for range 50 {
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

// blockingSinkStore holds every InsertEvent until release is closed, used to
// prove the sink and queue never stall the caller. It mirrors
// requestcapture's blockingQueueStore field for field so the two queues'
// tests stay comparable: records for what got through, insertErr for the
// store-failure path.
type blockingSinkStore struct {
	records   []EventRecord
	release   chan struct{}
	insertErr error
}

func (s *blockingSinkStore) InsertEvent(ctx context.Context, record EventRecord) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-s.release:
	}
	if s.insertErr != nil {
		return s.insertErr
	}
	s.records = append(s.records, record)
	return nil
}

// waitForRecords polls store.records until it reaches the expected count or
// times out, avoiding a fixed sleep for the single-serialized drain
// goroutine to catch up.
func waitForRecords(t *testing.T, store *recordingSinkStore, want int) []EventRecord {
	t.Helper()
	async.Eventually(t, func() bool { return len(store.records) >= want },
		"timed out waiting for %d records, got %d", want, len(store.records))
	return store.records
}

// TestSinkWriteUnboundEnqueuesWhenBindRacedIn drives the exact interleaving a
// goroutine race cannot reach reliably: a writer reads the queue pointer,
// sees nil, and is descheduled while Bind completes. By the time it takes the
// lock the sink is bound and its buffer already drained, so buffering would
// strand the entry and dropping would lose it -- it must enqueue live.
//
// Calling writeUnbound directly on an already-bound sink reproduces that
// state deterministically. Left to goroutine scheduling the branch is
// effectively unreachable, which makes it exactly the kind of defensive code
// that rots untested.
func TestSinkWriteUnboundEnqueuesWhenBindRacedIn(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 4})
	sink.Bind(queue, false)
	defer func() { _ = queue.Stop(context.Background()) }()

	sink.writeUnbound(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "raced past bind", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	records := waitForRecords(t, store, 1)
	if records[0].Message != "raced past bind" {
		t.Fatalf("expected the raced entry to be enqueued live, got %#v", records)
	}
	if got := sink.UnboundDrops(); got != 0 {
		t.Fatalf("expected no drop when Bind raced in ahead of the writer, got %d", got)
	}
	sink.mu.Lock()
	stranded := len(sink.buffer)
	sink.mu.Unlock()
	if stranded != 0 {
		t.Fatalf("expected nothing appended to the drained buffer, got %d", stranded)
	}
}

// TestSinkConcurrentWriteDuringBindDeliversExactlyOnce covers the hazard the
// pre-bind buffer introduces: a WriteEntry that observed a nil queue could
// append to a buffer Bind has already drained, stranding the entry forever.
//
// This follows requestcapture's TestQueueConcurrentStopRejectsEnqueueAndDrains
// AcceptedWork rather than sleeping and hoping: the writer is released only
// once the buffer is observably non-empty, so the interleaving is deterministic
// rather than timing-dependent, and the whole thing repeats to shake out
// scheduling variance. The invariant is conservation -- every entry arrives
// exactly once, whichever path it took.
func TestSinkConcurrentWriteDuringBindDeliversExactlyOnce(t *testing.T) {
	for iteration := range 100 {
		sink := NewSink(SinkConfig{})
		store := &recordingSinkStore{}
		queue := NewQueue(store, QueueConfig{Capacity: 8})

		sink.WriteEntry(sharedlogger.LogEntry{Domain: "system", Level: sharedlogger.LevelInfo, Message: "buffered", Timestamp: time.Now().UTC().Format(time.RFC3339)})

		// Wait until the entry is observably buffered, so Bind and the racing
		// write below are guaranteed to contend the same pre-bind state.
		async.AwaitState(t, func() bool {
			sink.mu.Lock()
			defer sink.mu.Unlock()
			return len(sink.buffer) == 1
		}, "iteration %d: entry never reached the pre-bind buffer", iteration)

		writeDone := make(chan struct{})
		go func() {
			sink.WriteEntry(sharedlogger.LogEntry{Domain: "system", Level: sharedlogger.LevelInfo, Message: "racing", Timestamp: time.Now().UTC().Format(time.RFC3339)})
			close(writeDone)
		}()
		sink.Bind(queue, false)
		<-writeDone

		if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
			t.Fatalf("iteration %d: expected clean drain, got %#v", iteration, result)
		}
		if got := sink.DroppedTotal(); got != 0 {
			t.Fatalf("iteration %d: expected no drops with spare capacity, got %d", iteration, got)
		}

		seen := map[string]int{}
		for _, record := range store.records {
			seen[record.Message]++
		}
		if seen["buffered"] != 1 || seen["racing"] != 1 {
			t.Fatalf("iteration %d: expected each entry exactly once, got %#v", iteration, seen)
		}

		sink.mu.Lock()
		stranded := len(sink.buffer)
		sink.mu.Unlock()
		if stranded != 0 {
			t.Fatalf("iteration %d: expected no entry stranded in the buffer after Bind, got %d", iteration, stranded)
		}
	}
}

// TestSinkPersistsMarkerEventWhenPreBindBufferOverflowed asserts an overflowed
// startup buffer leaves a durable trace in the event table rather than only an
// in-memory counter. The MCP sidecar is a separate process reading the SQLite
// file, so a counter it cannot reach would leave "nothing was logged" and
// "entries were discarded" indistinguishable to the only consumer that matters.
func TestSinkPersistsMarkerEventWhenPreBindBufferOverflowed(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	overflow := 3
	for i := 0; i < preBindBufferCapacity+overflow; i++ {
		sink.WriteEntry(sharedlogger.LogEntry{Domain: "sync", Level: sharedlogger.LevelInfo, Message: "hi", Timestamp: time.Now().UTC().Format(time.RFC3339)})
	}

	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: preBindBufferCapacity + 8})
	sink.Bind(queue, false)
	if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
		t.Fatalf("expected clean drain, got %#v", result)
	}

	var marker *EventRecord
	for i := range store.records {
		if store.records[i].EventType == "eventlog.prebind_overflow" {
			marker = &store.records[i]
		}
	}
	if marker == nil {
		t.Fatal("expected an eventlog.prebind_overflow marker event to be persisted")
	}
	if marker.Level != sharedlogger.LevelWarn {
		t.Fatalf("expected the marker at warn level, got %q", marker.Level)
	}
	if got := marker.Metadata["droppedBeforeBind"]; got != int64(overflow) {
		t.Fatalf("expected droppedBeforeBind %d, got %v", overflow, got)
	}
}

// TestSinkPersistsNoMarkerEventWhenNothingDropped asserts the marker is
// exceptional: a clean startup must not add a warn row to every run.
func TestSinkPersistsNoMarkerEventWhenNothingDropped(t *testing.T) {
	t.Parallel()

	sink := NewSink(SinkConfig{})
	sink.WriteEntry(sharedlogger.LogEntry{Domain: "system", Level: sharedlogger.LevelInfo, Message: "tracer bullet ready", Timestamp: time.Now().UTC().Format(time.RFC3339)})

	store := &recordingSinkStore{}
	queue := NewQueue(store, QueueConfig{Capacity: 8})
	sink.Bind(queue, false)
	if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
		t.Fatalf("expected clean drain, got %#v", result)
	}

	for _, record := range store.records {
		if record.EventType == "eventlog.prebind_overflow" {
			t.Fatalf("expected no overflow marker on a clean startup, got %#v", record)
		}
	}
}
