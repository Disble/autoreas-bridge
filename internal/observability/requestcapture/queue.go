// Package requestcapture provides a non-blocking bounded queue and sanitized persistence for captured bridge requests.
package requestcapture

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

// Store writes sanitized captures, inserting an arrival row or updating it
// to its terminal state on a later write sharing the same request_id.
type Store interface {
	UpsertCapture(ctx context.Context, record CaptureRecord) error
}

// QueueConfig defines bounded queue behavior.
type QueueConfig struct {
	Capacity int
	// OnPersist fires exactly once per record, after Store.UpsertCapture
	// succeeds for it, from the single serialized drain goroutine. Nil is a
	// safe no-op. Used to emit the real-time "capture.transaction" event from
	// the one choke point where a record is known to have actually persisted.
	OnPersist func(CaptureRecord)
}

// Queue is the non-blocking capture worker.
type Queue struct {
	store     Store
	onPersist func(CaptureRecord)
	ch        chan CaptureRecord
	stopped   chan struct{}
	stopOnce  sync.Once
	mu        sync.Mutex
	stopping  bool
	err       atomic.Pointer[error]
	dropped   atomic.Int64
	queued    atomic.Int64
	dequeued  atomic.Int64
}

// NewQueue starts a bounded capture worker.
func NewQueue(store Store, config QueueConfig) *Queue {
	capacity := config.Capacity
	if capacity <= 0 {
		capacity = 256
	}
	queue := &Queue{
		store:     store,
		onPersist: config.OnPersist,
		ch:        make(chan CaptureRecord, capacity),
		stopped:   make(chan struct{}),
	}
	go queue.run()
	return queue
}

// run drains the queue into storage until the channel is closed.
func (q *Queue) run() {
	defer close(q.stopped)
	for record := range q.ch {
		q.persist(record)
		q.dequeued.Add(1)
	}
}

// persist writes one record to the store and, only on success, notifies
// OnPersist from this single serialized drain goroutine.
func (q *Queue) persist(record CaptureRecord) {
	if q.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := q.store.UpsertCapture(ctx, record); err != nil {
		q.setErr(err)
		return
	}
	if q.onPersist != nil {
		q.onPersist(record)
	}
}

// TryEnqueue attempts a zero-wait enqueue.
func (q *Queue) TryEnqueue(record CaptureRecord) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.stopping {
		q.dropped.Add(1)
		return false
	}
	select {
	case q.ch <- record:
		q.queued.Add(1)
		return true
	default:
		q.dropped.Add(1)
		return false
	}
}

// Stop closes the queue and waits until drained or ctx expires.
func (q *Queue) Stop(ctx context.Context) QueueStopResult {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	q.stopOnce.Do(func() {
		q.mu.Lock()
		q.stopping = true
		close(q.ch)
		q.mu.Unlock()
	})
	select {
	case <-q.stopped:
		return QueueStopResult{}
	case <-ctx.Done():
		q.setErr(ctx.Err())
		unfinished := q.queued.Load() - q.dequeued.Load()
		if unfinished < 0 {
			unfinished = 0
		}
		return QueueStopResult{UnfinishedItems: int(unfinished)}
	}
}

// DroppedTotal reports overflow/closed drops.
func (q *Queue) DroppedTotal() int64 { return q.dropped.Load() }

// Err returns the last queue error.
func (q *Queue) Err() error {
	ptr := q.err.Load()
	if ptr == nil {
		return nil
	}
	return *ptr
}

// setErr stores the most recent queue error for later inspection.
func (q *Queue) setErr(err error) {
	if err == nil {
		return
	}
	q.err.Store(&err)
}
