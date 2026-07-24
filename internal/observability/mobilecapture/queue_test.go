package mobilecapture

import (
	"context"
	"errors"
	"runtime"
	"testing"
	"time"
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
		for {
			queue.mu.Lock()
			stopping := queue.stopping
			queue.mu.Unlock()
			if stopping {
				break
			}
			runtime.Gosched()
		}
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

type blockingQueueStore struct {
	records   []CaptureRecord
	release   chan struct{}
	insertErr error
}

func (s *blockingQueueStore) InsertCapture(ctx context.Context, record CaptureRecord) error {
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
