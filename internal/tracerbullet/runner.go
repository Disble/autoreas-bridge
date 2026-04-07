package tracerbullet

import "autoreas-bridge/internal/events"

const tracerAnimeID = "tracer-bullet-anime"

type TraceSink interface {
	Record(message string)
}

type Runner struct {
	bus  events.Bus
	sink TraceSink
}

func NewRunner(bus events.Bus, sink TraceSink) *Runner {
	return &Runner{
		bus:  bus,
		sink: sink,
	}
}

func (r *Runner) Start() {
	r.StartSubscriptions()
	r.sink.Record("system: tracer bullet ready")
	r.sink.Record("anime: publishing anime.changed for " + tracerAnimeID)
	r.bus.Publish(events.AnimeChangedEvent{AnimeID: tracerAnimeID})
}

func (r *Runner) StartSubscriptions() {
	r.bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}

		r.sink.Record("sync: received anime.changed for " + changed.AnimeID)
		r.bus.Publish(events.SyncRequestedEvent{Requester: changed.AnimeID})
	})

	r.bus.Subscribe(events.EventNameSyncRequested, func(event events.Event) {
		syncRequest, ok := event.(events.SyncRequestedEvent)
		if !ok {
			return
		}

		r.sink.Record("websocket: forwarded anime.changed for " + syncRequest.Requester)
	})
}
