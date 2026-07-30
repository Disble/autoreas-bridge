package eventlog

import (
	"sync/atomic"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
)

// Sink is the non-blocking write entry point from the shared logger into the
// persisted event log. It implements logger.EntrySink via WriteEntry and is
// registered as a FanoutLogger target at logger-construction time, before
// the database (and therefore the queue) exists -- Bind attaches the queue
// later, once bootstrap completes.
type Sink struct {
	queue        atomic.Pointer[Queue]
	persistDebug atomic.Bool
	now          func() int64
	unboundDrops atomic.Int64
	filtered     atomic.Int64
}

// NewSink builds an unbound sink. Every WriteEntry before Bind is called
// drops and is counted via UnboundDrops -- the accepted early-boot gap.
func NewSink(config SinkConfig) *Sink {
	now := config.Now
	if now == nil {
		now = func() int64 { return time.Now().UnixMilli() }
	}
	sink := &Sink{now: now}
	sink.persistDebug.Store(config.PersistDebug)
	return sink
}

// Bind attaches the queue this sink enqueues into and sets the debug-level
// persistence policy.
func (s *Sink) Bind(queue *Queue, persistDebug bool) {
	s.persistDebug.Store(persistDebug)
	s.queue.Store(queue)
}

// Unbind detaches the queue immediately so no further entry is enqueued.
// Called before Queue.Stop during shutdown so the logging goroutine takes
// this nil branch and never contends the queue's stop mutex.
func (s *Sink) Unbind() {
	s.queue.Store(nil)
}

// WriteEntry converts and enqueues one log entry. It never blocks: a nil
// queue, a filtered level, or a full queue all drop and return immediately
// on the caller's goroutine. The only allocation here is the EventRecord
// value itself.
func (s *Sink) WriteEntry(entry sharedlogger.LogEntry) {
	queue := s.queue.Load()
	if queue == nil {
		s.unboundDrops.Add(1)
		return
	}
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
