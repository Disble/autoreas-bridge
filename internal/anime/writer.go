package anime

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"sync"

	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// UpdateWriter serializes append-only legacy writes and their follow-up events.
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

// UpdateWriterConfig wires the append-only update writer dependencies.
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

// NewUpdateWriter builds the append-only anime update writer.
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

// RequestAppend performs only the durable Legacy append. The gateway publishes
// anime.changed after SQLite finalization confirms the operation committed.
func (w *updateWriter) RequestAppend(ctx context.Context, animeID string, payload []byte) error {
	return w.request(ctx, animeID, payload, false)
}

// request queues a writer operation and waits for its result.
func (w *updateWriter) request(ctx context.Context, animeID string, payload []byte, publishChanged bool) error {
	if err := ctx.Err(); err != nil {
		return legacy.NewDefiniteAppendError(err)
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
		return legacy.NewDefiniteAppendError(ctx.Err())
	case w.queue <- request:
	}

	select {
	case <-ctx.Done():
		return legacy.NewAmbiguousAppendError(ctx.Err())
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

func (w *updateWriter) LegacyFilePath() string {
	return w.filePath
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

// processUpdate appends one queued payload and reports its outcome.
func (w *updateWriter) processUpdate(request writeRequest) {
	log := newDomainLogger("anime", w.sharedLogger, w.logger)
	var err error
	if w.selfEchoRegistry != nil {
		w.selfEchoRegistry.Remember(request.payload)
	}

	if appendErr := w.appendLine(w.filePath, request.payload); appendErr != nil {
		err = w.handleAppendFailure(log, request, appendErr)
	} else if request.publishChanged && w.publisher != nil {
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

// handleAppendFailure records and publishes an append failure.
func (w *updateWriter) handleAppendFailure(log domainLogger, request writeRequest, appendErr error) error {
	appendErr = normalizeAppendError(appendErr)
	if legacy.IsDefiniteAppendError(appendErr) && w.selfEchoRegistry != nil {
		w.selfEchoRegistry.Forget(request.payload)
	}
	wrapped := fmt.Errorf("append anime update for %q at %q: %w", request.animeID, w.filePath, appendErr)
	if w.publisher != nil {
		w.publisher.Publish(events.AnimeWriteFailedEvent{AnimeID: request.animeID, Path: w.filePath, Err: wrapped.Error(), CorrelationID: request.correlationID})
	}
	log.Logf(sharedlogger.LevelWarn, sharedlogger.Fields{EntityID: request.animeID, EventType: "anime.write", CorrelationID: request.correlationID}, "%v", wrapped)
	w.setErr(wrapped)
	return wrapped
}

// normalizeAppendError converts append failures to the public error shape.
func normalizeAppendError(err error) error {
	if legacy.IsDefiniteAppendError(err) || legacy.IsAmbiguousAppendError(err) {
		return err
	}
	return legacy.NewAmbiguousAppendError(err)
}

// setErr stores the writer's terminal error.
func (w *updateWriter) setErr(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.err = err
}

// defaultAppendLine appends one newline-terminated payload to a file.
func defaultAppendLine(path string, payload []byte) error {
	return legacy.WithExclusiveFileMutation(path, func() error {
		file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
		if err != nil {
			return legacy.NewDefiniteAppendError(err)
		}
		appendErr := appendRecord(file, payload)
		closeErr := file.Close()
		if appendErr != nil {
			return appendErr
		}
		if closeErr != nil {
			return legacy.NewAmbiguousAppendError(closeErr)
		}
		return nil
	})
}

func (w *updateWriter) ReplacementEchoRegistry() legacy.ReplacementEchoRegistry {
	return w.selfEchoRegistry
}

type appendSyncWriter interface {
	Write([]byte) (int, error)
	Sync() error
}

// appendRecord writes and synchronizes one payload record.
func appendRecord(file appendSyncWriter, payload []byte) error {
	normalized := bytes.TrimRight(payload, "\r\n")
	record := append(append([]byte(nil), normalized...), '\n')
	written, err := file.Write(record)
	if err != nil {
		return legacy.NewAmbiguousAppendError(err)
	}
	if written != len(record) {
		return legacy.NewAmbiguousAppendError(io.ErrShortWrite)
	}
	if err := file.Sync(); err != nil {
		return legacy.NewAmbiguousAppendError(err)
	}
	return nil
}
