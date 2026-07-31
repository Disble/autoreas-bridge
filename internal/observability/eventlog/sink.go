package eventlog

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
)

// preBindBufferCapacity bounds the startup buffer that holds entries emitted
// before Bind. It matches the queue's default capacity: large enough to
// cover tray setup plus database bootstrap, small enough that a Bind which
// never arrives (failed bootstrap) cannot grow it without limit.
const preBindBufferCapacity = 256

// Sink is the non-blocking write entry point from the shared logger into the
// persisted event log. It implements logger.EntrySink via WriteEntry and is
// registered as a FanoutLogger target at logger-construction time, before
// the database (and therefore the queue) exists -- Bind attaches the queue
// later, once bootstrap completes and holds the interim entries until then.
type Sink struct {
	queue        atomic.Pointer[Queue]
	persistDebug atomic.Bool
	now          func() int64
	unboundDrops atomic.Int64
	filtered     atomic.Int64

	// mu guards the startup-only buffer. The post-Bind fast path never
	// takes it: WriteEntry reaches the mutex only while queue is nil,
	// which after a successful Bind happens only during shutdown.
	mu        sync.Mutex
	buffer    []sharedlogger.LogEntry
	everBound bool
}

// NewSink builds an unbound sink. Entries written before Bind are held in a
// bounded startup buffer and flushed by Bind; only overflow beyond that
// buffer drops and is counted via UnboundDrops.
func NewSink(config SinkConfig) *Sink {
	now := config.Now
	if now == nil {
		now = func() int64 { return time.Now().UnixMilli() }
	}
	sink := &Sink{now: now}
	sink.persistDebug.Store(config.PersistDebug)
	return sink
}

// Bind attaches the queue this sink enqueues into, sets the debug-level
// persistence policy, and flushes any entries buffered before the queue
// existed. The flush applies the level filter at this point rather than at
// buffer time, because PersistDebug is only known here.
func (s *Sink) Bind(queue *Queue, persistDebug bool) {
	s.persistDebug.Store(persistDebug)

	s.mu.Lock()
	s.queue.Store(queue)
	s.everBound = true
	buffered := s.buffer
	s.buffer = nil
	s.mu.Unlock()

	for _, entry := range buffered {
		s.enqueue(queue, entry)
	}
	s.recordPreBindOverflow(queue)
}

// recordPreBindOverflow persists a marker event when the startup buffer
// overflowed, so the loss is visible to the MCP sidecar.
//
// The drop counters live in this process's memory, and the sidecar is a
// separate process that can only read the SQLite file -- exactly the boundary
// that made the original visibility mismatch confusing. Reporting the loss
// therefore has to go through the same table as everything else, otherwise
// "no rows" and "rows were discarded" stay indistinguishable to any reader.
func (s *Sink) recordPreBindOverflow(queue *Queue) {
	dropped := s.unboundDrops.Load()
	if dropped == 0 {
		return
	}
	queue.TryEnqueue(EventRecord{
		OccurredAtMS: s.now(),
		Domain:       "observability",
		Level:        sharedlogger.LevelWarn,
		EventType:    "eventlog.prebind_overflow",
		Message: fmt.Sprintf("%d runtime events were discarded before event persistence began (startup buffer capacity %d)",
			dropped, preBindBufferCapacity),
		Metadata: map[string]any{
			"droppedBeforeBind": dropped,
			"bufferCapacity":    preBindBufferCapacity,
		},
	})
}

// Unbind detaches the queue immediately so no further entry is enqueued.
// Called before Queue.Stop during shutdown so the logging goroutine takes
// this nil branch and never contends the queue's stop mutex. It deliberately
// does not re-enable buffering: everBound stays true, so shutdown-time
// entries drop rather than accumulating in a buffer nothing will flush.
func (s *Sink) Unbind() {
	s.queue.Store(nil)
}

// WriteEntry converts and enqueues one log entry. It never blocks: a
// filtered level or a full queue drops and returns immediately on the
// caller's goroutine. Before the first Bind the entry is buffered instead,
// so the early-boot window is deferred rather than lost.
func (s *Sink) WriteEntry(entry sharedlogger.LogEntry) {
	queue := s.queue.Load()
	if queue == nil {
		s.writeUnbound(entry)
		return
	}
	s.enqueue(queue, entry)
}

// writeUnbound handles the nil-queue paths: buffer during startup, drop once
// the sink has been bound at least once (i.e. after Unbind at shutdown). The
// queue is re-checked under the lock so an entry cannot land in the buffer
// after Bind has already drained it.
func (s *Sink) writeUnbound(entry sharedlogger.LogEntry) {
	s.mu.Lock()
	if queue := s.queue.Load(); queue != nil {
		s.mu.Unlock()
		s.enqueue(queue, entry)
		return
	}
	if s.everBound || len(s.buffer) >= preBindBufferCapacity {
		s.mu.Unlock()
		s.unboundDrops.Add(1)
		return
	}
	s.buffer = append(s.buffer, entry)
	s.mu.Unlock()
}

// enqueue applies the debug-level policy and hands the converted record to
// the queue. Shared by the live path and the pre-bind flush so both obey the
// same filter.
func (s *Sink) enqueue(queue *Queue, entry sharedlogger.LogEntry) {
	if entry.Level == sharedlogger.LevelDebug && !s.persistDebug.Load() {
		s.filtered.Add(1)
		return
	}
	queue.TryEnqueue(s.toEventRecord(entry))
}

// toEventRecord converts a LogEntry into an EventRecord, resolving the
// occurred-at timestamp on the caller's goroutine.
func (s *Sink) toEventRecord(entry sharedlogger.LogEntry) EventRecord {
	return EventRecord{
		OccurredAtMS:  s.occurredAtMS(entry.Timestamp),
		Domain:        entry.Domain,
		Level:         entry.Level,
		Message:       entry.Message,
		CorrelationID: entry.CorrelationID,
		EntityID:      entry.EntityID,
		EventType:     entry.EventType,
		DurationMS:    entry.DurationMs,
		Metadata:      entry.Metadata,
	}
}

// occurredAtMS parses the entry's RFC3339 timestamp into epoch millis,
// falling back to the injected clock when the timestamp is unparsable.
func (s *Sink) occurredAtMS(timestamp string) int64 {
	parsed, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return s.now()
	}
	return parsed.UnixMilli()
}

// UnboundDrops reports how many entries were dropped because no queue was
// bound yet (the accepted early-boot gap).
func (s *Sink) UnboundDrops() int64 { return s.unboundDrops.Load() }

// FilteredDrops reports how many entries were dropped by the debug-level
// policy.
func (s *Sink) FilteredDrops() int64 { return s.filtered.Load() }

// DroppedTotal reports every drop this sink is responsible for: unbound,
// filtered, or (once bound) queue overflow.
func (s *Sink) DroppedTotal() int64 {
	total := s.unboundDrops.Load() + s.filtered.Load()
	if queue := s.queue.Load(); queue != nil {
		total += queue.DroppedTotal()
	}
	return total
}
