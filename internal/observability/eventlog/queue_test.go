package eventlog

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/testsupport/async"
)

// This file closes a gap found by mutation testing (docs/mutation-testing.md):
// eventlog.Queue was written as a deliberate mirror of
// internal/observability/requestcapture.Queue, but only the code was mirrored.
// Its Err, setErr, Stop-deadline, TryEnqueue-stopping, and persist error paths
// had no coverage at all, while requestcapture's queue_test.go covers every
// one. These tests port that suite across, minus the OnPersist cases -- the
// event queue has no such hook.

// TestQueueDropsOverflowWithoutBlocking asserts a full queue drops the
// overflowing record instead of stalling the caller, and that the accepted
// record still reaches the store.
func TestQueueDropsOverflowWithoutBlocking(t *testing.T) {
	t.Parallel()

	store := &blockingSinkStore{release: make(chan struct{})}
	queue := NewQueue(store, QueueConfig{Capacity: 1})

	if ok := queue.TryEnqueue(EventRecord{Message: "first"}); !ok {
		t.Fatal("expected first enqueue to succeed")
	}
	// Capacity 1 plus at most one record already claimed by the drain
	// goroutine, so keep enqueueing until one is refused rather than
	// assuming which attempt overflows.
	overflowed := false
	for i := 0; i < 8 && !overflowed; i++ {
		overflowed = !queue.TryEnqueue(EventRecord{Message: "overflow"})
	}
	if !overflowed {
		t.Fatal("expected a bounded queue to refuse a record once full")
	}
	if got := queue.DroppedTotal(); got == 0 {
		t.Fatal("expected the refused record to be counted in DroppedTotal")
	}

	close(store.release)
	if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
		t.Fatalf("expected a clean drain once the store is released, got %#v", result)
	}
	if len(store.records) == 0 || store.records[0].Message != "first" {
		t.Fatalf("expected the accepted record to reach the store, got %#v", store.records)
	}
}

// TestQueueStopReportsUnfinishedItemsAfterDeadline covers Stop's ctx.Done
// branch: a store that never releases must not hang shutdown forever, and the
// records still in flight must be reported rather than silently abandoned.
func TestQueueStopReportsUnfinishedItemsAfterDeadline(t *testing.T) {
	t.Parallel()

	// Skipped under -short: this test spends 5s waiting out Stop's internal
	// deadline, which is ~80% of the package's test time. tools/mutationstaged
	// runs -short because it re-runs this suite once per mutant, and a mutant
	// that only this test would catch is one whose effect is a hang -- which
	// surfaces as a timeout anyway.
	if testing.Short() {
		t.Skip("skipping the 5s shutdown-deadline wait under -short")
	}

	store := &blockingSinkStore{release: make(chan struct{})}
	queue := NewQueue(store, QueueConfig{Capacity: 2})

	if ok := queue.TryEnqueue(EventRecord{Message: "one"}); !ok {
		t.Fatal("expected enqueue to succeed")
	}
	if ok := queue.TryEnqueue(EventRecord{Message: "two"}); !ok {
		t.Fatal("expected second enqueue to succeed")
	}

	started := time.Now()
	result := queue.Stop(context.Background())
	if result.UnfinishedItems == 0 {
		t.Fatal("expected unfinished items to be reported when the drain times out")
	}
	if elapsed := time.Since(started); elapsed > 6*time.Second {
		t.Fatalf("expected Stop to honour its internal shutdown deadline, took %s", elapsed)
	}
	close(store.release)

	if err := queue.Err(); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected the queue error to wrap the shutdown deadline, got %v", err)
	}
}

// TestQueueConcurrentStopRejectsEnqueueAndDrainsAcceptedWork covers
// TryEnqueue's stopping branch: once Stop has begun, further records are
// refused, while work already accepted is still drained. Repeated to shake out
// scheduling variance, following requestcapture's equivalent test.
func TestQueueConcurrentStopRejectsEnqueueAndDrainsAcceptedWork(t *testing.T) {
	for iteration := 0; iteration < 100; iteration++ {
		store := &blockingSinkStore{release: make(chan struct{})}
		queue := NewQueue(store, QueueConfig{Capacity: 1})
		if !queue.TryEnqueue(EventRecord{Message: "accepted"}) {
			t.Fatalf("iteration %d: expected initial enqueue to succeed", iteration)
		}

		stopDone := make(chan struct{})
		go func() {
			queue.Stop(context.Background())
			close(stopDone)
		}()
		async.AwaitState(t, func() bool {
			queue.mu.Lock()
			defer queue.mu.Unlock()
			return queue.stopping
		}, "iteration %d: queue never entered the stopping state", iteration)

		if queue.TryEnqueue(EventRecord{Message: "late"}) {
			t.Fatalf("iteration %d: expected enqueue to be rejected once stopping", iteration)
		}
		close(store.release)
		<-stopDone

		if queue.queued.Load() != queue.dequeued.Load() {
			t.Fatalf("iteration %d: expected accepted work to drain: queued=%d dequeued=%d",
				iteration, queue.queued.Load(), queue.dequeued.Load())
		}
	}
}

// TestQueueRecordsStoreErrorAndKeepsDraining covers persist's failure path:
// a store write error is retained for later inspection via Err, and the drain
// goroutine survives it rather than dying on the first bad record.
func TestQueueRecordsStoreErrorAndKeepsDraining(t *testing.T) {
	t.Parallel()

	writeErr := errors.New("insert failed")
	store := &blockingSinkStore{release: make(chan struct{}), insertErr: writeErr}
	close(store.release) // let every write complete (and fail) immediately
	queue := NewQueue(store, QueueConfig{Capacity: 4})

	for i := 0; i < 3; i++ {
		if ok := queue.TryEnqueue(EventRecord{Message: "doomed"}); !ok {
			t.Fatalf("expected enqueue %d to succeed", i)
		}
	}
	if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
		t.Fatalf("expected the drain to survive store failures, got %#v", result)
	}

	if err := queue.Err(); !errors.Is(err, writeErr) {
		t.Fatalf("expected the store error to be retained, got %v", err)
	}
	if queue.queued.Load() != queue.dequeued.Load() {
		t.Fatalf("expected every accepted record to be processed despite failures: queued=%d dequeued=%d",
			queue.queued.Load(), queue.dequeued.Load())
	}
}

// TestQueueWithNilStoreDrainsWithoutPanicking covers persist's nil-store
// guard. App wiring can construct a queue before a store exists; the drain
// goroutine must treat that as a no-op rather than dereferencing nil.
func TestQueueWithNilStoreDrainsWithoutPanicking(t *testing.T) {
	t.Parallel()

	queue := NewQueue(nil, QueueConfig{Capacity: 2})
	if ok := queue.TryEnqueue(EventRecord{Message: "into the void"}); !ok {
		t.Fatal("expected enqueue to succeed even without a store")
	}

	if result := queue.Stop(context.Background()); result.UnfinishedItems != 0 {
		t.Fatalf("expected a clean drain with no store, got %#v", result)
	}
	if err := queue.Err(); err != nil {
		t.Fatalf("expected no error from a nil store, got %v", err)
	}
}

// TestNewQueueAppliesDefaultCapacityWhenUnset asserts a non-positive capacity
// falls back to the built-in default rather than producing an unbuffered
// queue that drops nearly everything. Asserted by contrast: 200 records fit
// the default, where an explicitly tiny queue refuses almost immediately.
func TestNewQueueAppliesDefaultCapacityWhenUnset(t *testing.T) {
	t.Parallel()

	defaulted := NewQueue(&blockingSinkStore{release: make(chan struct{})}, QueueConfig{})
	for i := 0; i < 200; i++ {
		if ok := defaulted.TryEnqueue(EventRecord{Message: "buffered"}); !ok {
			t.Fatalf("expected the default capacity to accept 200 records, refused at %d", i)
		}
	}
	if got := defaulted.DroppedTotal(); got != 0 {
		t.Fatalf("expected no drops within the default capacity, got %d", got)
	}
	// Err's nil branch: nothing has failed, so it must report no error.
	if err := defaulted.Err(); err != nil {
		t.Fatalf("expected no error on a healthy queue, got %v", err)
	}

	tiny := NewQueue(&blockingSinkStore{release: make(chan struct{})}, QueueConfig{Capacity: 1})
	refused := false
	for i := 0; i < 200 && !refused; i++ {
		refused = !tiny.TryEnqueue(EventRecord{Message: "buffered"})
	}
	if !refused {
		t.Fatal("expected an explicitly tiny queue to refuse well within 200 records")
	}
}

// TestQueueStopClampsNegativeUnfinishedCount covers Stop's `unfinished < 0`
// guard. The counters cannot invert through the public API -- dequeued only
// advances after a record the queue already counted leaves the channel -- so
// the branch is driven by skewing the counters directly. Without the clamp a
// skew would surface as a negative UnfinishedItems, which reads as nonsense in
// a shutdown report.
func TestQueueStopClampsNegativeUnfinishedCount(t *testing.T) {
	t.Parallel()

	store := &blockingSinkStore{release: make(chan struct{})}
	queue := NewQueue(store, QueueConfig{Capacity: 1})
	if ok := queue.TryEnqueue(EventRecord{Message: "stuck"}); !ok {
		t.Fatal("expected enqueue to succeed")
	}
	// Force dequeued past queued so the subtraction goes negative.
	queue.dequeued.Add(5)

	// An explicit short deadline, not context.Background(): Stop's internal
	// 5s budget and persist's own 5s write context would otherwise race, and
	// with a single in-flight record persist can win, letting Stop return
	// through the clean drain path and never evaluate this clamp at all.
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	result := queue.Stop(ctx)
	close(store.release)

	if result.UnfinishedItems < 0 {
		t.Fatalf("expected a clamped, non-negative unfinished count, got %d", result.UnfinishedItems)
	}
}

// TestQueueSetErrIgnoresNil covers setErr's defensive nil guard. Nothing in
// the queue calls setErr(nil) -- persist and Stop both pass a real error -- so
// the branch is unreachable through the public API and is driven directly,
// the same way Sink.writeUnbound's raced-Bind branch is.
func TestQueueSetErrIgnoresNil(t *testing.T) {
	t.Parallel()

	queue := NewQueue(nil, QueueConfig{Capacity: 1})
	defer func() { _ = queue.Stop(context.Background()) }()

	sentinel := errors.New("real failure")
	queue.setErr(sentinel)
	queue.setErr(nil)

	if err := queue.Err(); !errors.Is(err, sentinel) {
		t.Fatalf("expected setErr(nil) to leave the recorded error untouched, got %v", err)
	}
}
