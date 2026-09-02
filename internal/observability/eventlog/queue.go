package eventlog

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

// Inserter persists one event record, applied by the single serialized drain
// goroutine.
type Inserter interface {
	InsertEvent(ctx context.Context, record EventRecord) error
}

// QueueConfig defines bounded queue behavior.
type QueueConfig struct {
	Capacity int
}

// Queue is the non-blocking event-persistence worker. It mirrors
// requestcapture.Queue's zero-wait enqueue and single serialized drain
// goroutine exactly, over EventRecord instead of CaptureRecord.
type Queue struct {
	store    Inserter
	ch       chan EventRecord
	stopped  chan struct{}
	stopOnce sync.Once
	mu       sync.Mutex
	stopping bool
	err      atomic.Pointer[error]
	dropped  atomic.Int64
	queued   atomic.Int64
	dequeued atomic.Int64
}

// NewQueue starts a bounded event-persistence worker.
func NewQueue(store Inserter, config QueueConfig) *Queue {
	capacity := config.Capacity
	if capacity <= 0 {
		capacity = 256
	}
	queue := &Queue{
		store:   store,
		ch:      make(chan EventRecord, capacity),
		stopped: make(chan struct{}),
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

// persist writes one record to the store from the single serialized drain
// goroutine.
func (q *Queue) persist(record EventRecord) {
	if q.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := q.store.InsertEvent(ctx, record); err != nil {
		q.setErr(err)
	}
}

// TryEnqueue attempts a zero-wait enqueue.
func (q *Queue) TryEnqueue(record EventRecord) bool {
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
		unfinished := max(q.queued.Load()-q.dequeued.Load(), 0)
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

// QueueStopResult reports drain leftovers after Stop.
type QueueStopResult struct {
	UnfinishedItems int
}
