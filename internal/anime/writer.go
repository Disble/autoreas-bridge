package anime

import (
	"context"
	"fmt"
	"sync"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// UpdateWriter serializes queued anime updates and their follow-up events.
//
// SDD-55 Slice B: the file-append channel is gone entirely (no more
// animes.dat writer, no `AppendLine` seam) -- persist() finalizes straight
// into SQLite (ADR-55-1), so a queued update always trivially succeeds here.
// UpdateWriter's remaining, load-bearing job is publishing the committed
// `anime.changed` event after the SQLite outbox drains (PublishCommitted,
// wired as the `committedAnimePublisher` fallback in WriteService/
// EditorService/ScheduleService.publishCommitted).
type UpdateWriter interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
	RequestWrite(ctx context.Context, animeID string, payload []byte) error
}

type writeRequest struct {
	animeID        string
	payload        []byte
	correlationID  string
	publishChanged bool
	result         chan<- error
}

// UpdateWriterConfig wires the anime update writer dependencies.
type UpdateWriterConfig struct {
	Bus              events.Bus
	Publisher        EventPublisher
	Logger           WarningLogger
	SharedLogger     sharedlogger.Logger
	SelfEchoRegistry SelfEchoRegistry
	QueueSize        int
}

type updateWriter struct {
	bus              events.Bus
	publisher        EventPublisher
	logger           WarningLogger
	sharedLogger     sharedlogger.Logger
	selfEchoRegistry SelfEchoRegistry
	queueSize        int

	startOnce sync.Once
	wg        sync.WaitGroup

	queue       chan writeRequest
	unsubscribe func()

	mu  sync.Mutex
	err error
}

// NewUpdateWriter builds the anime update writer.
func NewUpdateWriter(config UpdateWriterConfig) UpdateWriter {
	writer := &updateWriter{
		bus:              config.Bus,
		publisher:        config.Publisher,
		logger:           config.Logger,
		sharedLogger:     config.SharedLogger,
		selfEchoRegistry: config.SelfEchoRegistry,
		queueSize:        config.QueueSize,
	}

	if writer.publisher == nil {
		writer.publisher = writer.bus
	}
	if writer.queueSize <= 0 {
		writer.queueSize = 128
	}
	writer.queue = make(chan writeRequest, writer.queueSize)

	return writer
}

func (w *updateWriter) StartAsync(ctx context.Context) {
	w.startOnce.Do(func() {
		if w.bus == nil {
			w.setErr(fmt.Errorf("update writer bus is required"))
			return
		}

		w.unsubscribe = w.bus.Subscribe(events.EventNameAnimeUpdateRequested, func(event events.Event) {
			update, ok := event.(events.AnimeUpdateRequestedEvent)
			if !ok {
				return
			}

			request := writeRequest{
				animeID:        update.AnimeID,
				payload:        append([]byte(nil), update.Payload...),
				correlationID:  update.CorrelationID,
				publishChanged: true,
			}

			select {
			case <-ctx.Done():
				return
			case w.queue <- request:
			}
		})

		w.wg.Add(1)
		go func() {
			defer w.wg.Done()
			w.run(ctx)
		}()
	})
}

func (w *updateWriter) Wait() {
	w.wg.Wait()
}

func (w *updateWriter) Err() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.err
}

func (w *updateWriter) RequestWrite(ctx context.Context, animeID string, payload []byte) error {
	return w.request(ctx, animeID, payload, true)
}

// request queues a writer operation and waits for its result.
func (w *updateWriter) request(ctx context.Context, animeID string, payload []byte, publishChanged bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	result := make(chan error, 1)
	request := writeRequest{
		animeID:        animeID,
		payload:        append([]byte(nil), payload...),
		publishChanged: publishChanged,
		result:         result,
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case w.queue <- request:
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-result:
		return err
	}
}

func (w *updateWriter) PublishCommitted(eventID, animeID string, payload []byte) {
	if w.publisher == nil {
		return
	}
	w.publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: animeID, Payload: append([]byte(nil), payload...)})
}

// run processes queued writer operations serially.
func (w *updateWriter) run(ctx context.Context) {
	defer func() {
		if w.unsubscribe != nil {
			w.unsubscribe()
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case request := <-w.queue:
			w.processUpdate(request)
		}
	}
}

// processUpdate publishes one queued update and reports its outcome. There is
// no file to append to anymore (SDD-55 Slice B), so a queued request always
// trivially succeeds.
func (w *updateWriter) processUpdate(request writeRequest) {
	log := newDomainLogger("anime", w.sharedLogger, w.logger)
	if w.selfEchoRegistry != nil {
		w.selfEchoRegistry.Remember(request.payload)
	}

	if request.publishChanged && w.publisher != nil {
		w.publisher.Publish(events.AnimeChangedEvent{
			AnimeID:       request.animeID,
			Payload:       append([]byte(nil), request.payload...),
			CorrelationID: request.correlationID,
		})
		log.Logf(sharedlogger.LevelInfo, sharedlogger.Fields{
			EntityID:      request.animeID,
			EventType:     "anime.write",
			CorrelationID: request.correlationID,
		}, "processed queued update and published anime.changed for %s", request.animeID)
	}

	if request.result != nil {
		request.result <- nil
	}
}

// setErr stores the writer's terminal error.
func (w *updateWriter) setErr(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.err = err
}
