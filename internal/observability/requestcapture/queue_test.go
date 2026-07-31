package requestcapture

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/testsupport/async"
)

func TestQueueDropsOverflowWithoutBlockingCanonicalFlow(t *testing.T) {
	t.Parallel()

	store := &blockingQueueStore{release: make(chan struct{})}
	queue := NewQueue(store, QueueConfig{Capacity: 1})

	first := NewCaptureRecord("patch", "device-1")
	second := NewCaptureRecord("patch", "device-2")

	if ok := queue.TryEnqueue(first); !ok {
		t.Fatal("expected first enqueue to succeed")
	}
	if ok := queue.TryEnqueue(second); ok {
		t.Fatal("expected overflow enqueue to be dropped")
	}
	if got := queue.DroppedTotal(); got != 1 {
		t.Fatalf("expected dropped_total 1, got %d", got)
	}

	close(store.release)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result := queue.Stop(ctx)
	if result.UnfinishedItems != 0 {
		t.Fatalf("expected no unfinished items after successful drain, got %d", result.UnfinishedItems)
	}
	if len(store.records) != 1 || store.records[0].Device.DeviceID != "device-1" {
		t.Fatalf("expected only the first record to be stored, got %#v", store.records)
	}
}

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

	store := &blockingQueueStore{release: make(chan struct{})}
	queue := NewQueue(store, QueueConfig{Capacity: 2})

	if ok := queue.TryEnqueue(NewCaptureRecord("patch", "device-1")); !ok {
		t.Fatal("expected enqueue to succeed")
	}
	if ok := queue.TryEnqueue(NewCaptureRecord("patch", "device-2")); !ok {
		t.Fatal("expected second enqueue to succeed")
	}

	started := time.Now()
	result := queue.Stop(context.Background())
	if result.UnfinishedItems == 0 {
		t.Fatal("expected unfinished_items to be reported when drain times out")
	}
	if elapsed := time.Since(started); elapsed > 6*time.Second {
		t.Fatalf("expected internal shutdown deadline, took %s", elapsed)
	}
	close(store.release)
	if err := queue.Err(); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected queue error to wrap context deadline, got %v", err)
	}
}

func TestQueueConcurrentStopRejectsEnqueueAndDrainsAcceptedWork(t *testing.T) {
	for iteration := 0; iteration < 100; iteration++ {
		store := &blockingQueueStore{release: make(chan struct{})}
		queue := NewQueue(store, QueueConfig{Capacity: 1})
		if !queue.TryEnqueue(NewCaptureRecord("patch", "accepted")) {
			t.Fatal("expected initial enqueue to succeed")
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
		if queue.TryEnqueue(NewCaptureRecord("patch", "late")) {
			t.Fatal("expected enqueue to be rejected after stopping starts")
		}
		close(store.release)
		<-stopDone
		if queue.queued.Load() != queue.dequeued.Load() {
			t.Fatalf("expected accepted work to drain: queued=%d dequeued=%d", queue.queued.Load(), queue.dequeued.Load())
		}
	}
}

func TestQueueOnPersistFiresOncePerPersistedRecordAfterStoreWrite(t *testing.T) {
	t.Parallel()

	store := &blockingQueueStore{release: make(chan struct{})}
	close(store.release) // let the store write complete immediately

	var (
		mu        sync.Mutex
		persisted []CaptureRecord
	)
	queue := NewQueue(store, QueueConfig{Capacity: 4, OnPersist: func(record CaptureRecord) {
		mu.Lock()
		defer mu.Unlock()
		persisted = append(persisted, record)
	}})

	record := NewCaptureRecord("patch", "device-1")
	record.RequestID = "req-onpersist"
	if ok := queue.TryEnqueue(record); !ok {
		t.Fatal("expected enqueue to succeed")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if result := queue.Stop(ctx); result.UnfinishedItems != 0 {
		t.Fatalf("expected clean drain, got %#v", result)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(persisted) != 1 || persisted[0].RequestID != "req-onpersist" {
		t.Fatalf("expected OnPersist to fire exactly once with the persisted record, got %#v", persisted)
	}
}

func TestQueueOnPersistDoesNotFireOnStoreWriteFailure(t *testing.T) {
	t.Parallel()

	store := &blockingQueueStore{release: make(chan struct{}), insertErr: errors.New("write failed")}
	close(store.release)

	var (
		mu        sync.Mutex
		persisted []CaptureRecord
	)
	queue := NewQueue(store, QueueConfig{Capacity: 1, OnPersist: func(record CaptureRecord) {
		mu.Lock()
		defer mu.Unlock()
		persisted = append(persisted, record)
	}})

	if ok := queue.TryEnqueue(NewCaptureRecord("patch", "device-1")); !ok {
		t.Fatal("expected enqueue to succeed")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	queue.Stop(ctx)

	mu.Lock()
	defer mu.Unlock()
	if len(persisted) != 0 {
		t.Fatalf("expected OnPersist not to fire after a failed store write, got %#v", persisted)
	}
}

type blockingQueueStore struct {
	records   []CaptureRecord
	release   chan struct{}
	insertErr error
}

func (s *blockingQueueStore) UpsertCapture(ctx context.Context, record CaptureRecord) error {
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
