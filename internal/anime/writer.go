package anime

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"sync"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

type UpdateWriter interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
	RequestWrite(ctx context.Context, animeID string, payload []byte) error
}

type writeRequest struct {
	animeID       string
	payload       []byte
	correlationID string
	result        chan<- error
}

type UpdateWriterConfig struct {
	FilePath         string
	Bus              events.Bus
	Publisher        EventPublisher
	Logger           WarningLogger
	SharedLogger     sharedlogger.Logger
	SelfEchoRegistry SelfEchoRegistry
	QueueSize        int
	AppendLine       func(path string, payload []byte) error
}

type updateWriter struct {
	filePath         string
	bus              events.Bus
	publisher        EventPublisher
	logger           WarningLogger
	sharedLogger     sharedlogger.Logger
	selfEchoRegistry SelfEchoRegistry
	queueSize        int
	appendLine       func(path string, payload []byte) error

	startOnce sync.Once
	wg        sync.WaitGroup

	queue       chan writeRequest
	unsubscribe func()

	mu  sync.Mutex
	err error
}

func NewUpdateWriter(config UpdateWriterConfig) UpdateWriter {
	writer := &updateWriter{
		filePath:         config.FilePath,
		bus:              config.Bus,
		publisher:        config.Publisher,
		logger:           config.Logger,
		sharedLogger:     config.SharedLogger,
		selfEchoRegistry: config.SelfEchoRegistry,
		queueSize:        config.QueueSize,
		appendLine:       config.AppendLine,
	}

	if writer.publisher == nil {
		writer.publisher = writer.bus
	}
	if writer.queueSize <= 0 {
		writer.queueSize = 128
	}
	if writer.appendLine == nil {
		writer.appendLine = defaultAppendLine
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
				animeID:       update.AnimeID,
				payload:       append([]byte(nil), update.Payload...),
				correlationID: update.CorrelationID,
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
	result := make(chan error, 1)
	request := writeRequest{
		animeID: animeID,
		payload: append([]byte(nil), payload...),
		result:  result,
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

func (w *updateWriter) processUpdate(request writeRequest) {
	log := newDomainLogger("anime", w.sharedLogger, w.logger)
	var err error
	if w.selfEchoRegistry != nil {
		w.selfEchoRegistry.Remember(request.payload)
	}

	if appendErr := w.appendLine(w.filePath, request.payload); appendErr != nil {
		if w.selfEchoRegistry != nil {
			w.selfEchoRegistry.Forget(request.payload)
		}
		wrapped := fmt.Errorf("append anime update for %q at %q: %w", request.animeID, w.filePath, appendErr)
		if w.publisher != nil {
			w.publisher.Publish(events.AnimeWriteFailedEvent{
				AnimeID:       request.animeID,
				Path:          w.filePath,
				Err:           wrapped.Error(),
				CorrelationID: request.correlationID,
			})
		}
		log.Logf(sharedlogger.LevelWarn, sharedlogger.Fields{
			EntityID:      request.animeID,
			EventType:     "anime.write",
			CorrelationID: request.correlationID,
		}, "%v", wrapped)
		w.setErr(wrapped)
		err = wrapped
	} else if w.publisher != nil {
		w.publisher.Publish(events.AnimeChangedEvent{
			AnimeID:       request.animeID,
			Payload:       append([]byte(nil), request.payload...),
			CorrelationID: request.correlationID,
		})
		log.Logf(sharedlogger.LevelInfo, sharedlogger.Fields{
			EntityID:      request.animeID,
			EventType:     "anime.write",
			CorrelationID: request.correlationID,
		}, "appended update and published anime.changed for %s", request.animeID)
	}

	if request.result != nil {
		request.result <- err
	}
}

func (w *updateWriter) setErr(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.err = err
}

func defaultAppendLine(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	normalized := bytes.TrimRight(payload, "\r\n")
	if _, err := file.Write(normalized); err != nil {
		return err
	}
	if _, err := file.Write([]byte("\n")); err != nil {
		return err
	}

	return nil
}
