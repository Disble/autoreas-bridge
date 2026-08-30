package tracerbullet

import (
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

const tracerAnimeID = "tracer-bullet-anime"

// tracerDomain is the log domain every tracer-bullet entry carries.
//
// It is a constant rather than a value parsed out of the message, because the
// runner used to derive it by splitting its own sentence on ": " and passing
// the prefix as the domain. That made "anime: publishing..." arrive as
// domain=anime, which is why every `anime` row in runtime_events was a
// demonstration event and a dashboard could report "all healthy" about a
// harness while real writes went unlogged. A domain is a contract; prose
// changes for readability reasons.
const tracerDomain = "tracer-bullet"

// tracerEventType marks an entry as one step of the tracer-bullet sequence so
// health rollups can exclude synthetic traffic from a real-entity ratio.
const tracerEventType = "tracer.step"

// TraceSink records tracer-bullet messages.
type TraceSink interface {
	Record(message string)
}

// Runner publishes the tracer-bullet event sequence.
type Runner struct {
	bus  events.Bus
	sink TraceSink
	log  sharedlogger.Logger
}

// NewRunner creates a tracer-bullet runner.
func NewRunner(bus events.Bus, sink TraceSink, loggers ...sharedlogger.Logger) *Runner {
	runner := &Runner{
		bus:  bus,
		sink: sink,
	}
	if len(loggers) > 0 {
		runner.log = loggers[0]
	}
	return runner

}

// Start subscribes the runner and publishes its demonstration event.
func (r *Runner) Start() {
	r.StartSubscriptions()
	r.record("system", "tracer bullet ready")
	r.record("anime", "publishing anime.changed for "+tracerAnimeID)
	r.bus.Publish(events.AnimeChangedEvent{AnimeID: tracerAnimeID})
}

// StartSubscriptions installs the tracer-bullet event handlers.
func (r *Runner) StartSubscriptions() {
	r.bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}

		r.record("sync", "received anime.changed for "+changed.AnimeID)
		r.bus.Publish(events.SyncRequestedEvent{Requester: changed.AnimeID})
	})

	r.bus.Subscribe(events.EventNameSyncRequested, func(event events.Event) {
		syncRequest, ok := event.(events.SyncRequestedEvent)
		if !ok {
			return
		}

		r.record("websocket", "forwarded anime.changed for "+syncRequest.Requester)
	})
}

// record sends a tracer-bullet message to the configured sink and logger.
//
// The stage is passed in, never parsed back out of the message. The sink still
// receives the full "stage: message" sentence because the desktop Transactions
// view renders it verbatim, but the log entry carries the stage as METADATA
// while its domain, entity id, and event type stay fixed. The distinction is
// the whole point: a stage is data, a domain is a contract, and deriving the
// second from prose is what made every `anime` row in runtime_events a
// demonstration event.
func (r *Runner) record(stage, message string) {
	if r.sink != nil {
		r.sink.Record(stage + ": " + message)
	}
	if r.log == nil {
		return
	}
	r.log.Logf(tracerDomain, sharedlogger.LevelInfo, sharedlogger.Fields{
		EntityID:  tracerAnimeID,
		EventType: tracerEventType,
		Metadata:  map[string]any{"stage": stage},
	}, "%s", message)
}
