package tracerbullet

import (
	"strings"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

const tracerAnimeID = "tracer-bullet-anime"

type TraceSink interface {
	Record(message string)
}

type Runner struct {
	bus  events.Bus
	sink TraceSink
	log  sharedlogger.Logger
}

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

func (r *Runner) Start() {
	r.StartSubscriptions()
	r.record("system: tracer bullet ready")
	r.record("anime: publishing anime.changed for " + tracerAnimeID)
	r.bus.Publish(events.AnimeChangedEvent{AnimeID: tracerAnimeID})
}

func (r *Runner) StartSubscriptions() {
	r.bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}

		r.record("sync: received anime.changed for " + changed.AnimeID)
		r.bus.Publish(events.SyncRequestedEvent{Requester: changed.AnimeID})
	})

	r.bus.Subscribe(events.EventNameSyncRequested, func(event events.Event) {
		syncRequest, ok := event.(events.SyncRequestedEvent)
		if !ok {
			return
		}

		r.record("websocket: forwarded anime.changed for " + syncRequest.Requester)
	})
}

func (r *Runner) record(message string) {
	if r.sink != nil {
		r.sink.Record(message)
	}
	if r.log == nil {
		return
	}
	parts := strings.SplitN(message, ": ", 2)
	if len(parts) != 2 {
		r.log.Infof("system", "%s", message)
		return
	}
	r.log.Infof(parts[0], "%s", parts[1])
}
