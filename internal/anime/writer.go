package anime

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"sync"

	"autoreas-bridge/internal/events"
)

type UpdateWriter interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
}

type UpdateWriterConfig struct {
	FilePath         string
	Bus              events.Bus
	Publisher        EventPublisher
	Logger           WarningLogger
	SelfEchoRegistry SelfEchoRegistry
	QueueSize        int
	AppendLine       func(path string, payload []byte) error
}

type updateWriter struct {
	filePath         string
	bus              events.Bus
	publisher        EventPublisher
	logger           WarningLogger
	selfEchoRegistry SelfEchoRegistry
	queueSize        int
	appendLine       func(path string, payload []byte) error

	startOnce sync.Once
	wg        sync.WaitGroup

	queue       chan events.AnimeUpdateRequestedEvent
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
	writer.queue = make(chan events.AnimeUpdateRequestedEvent, writer.queueSize)

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

			select {
			case <-ctx.Done():
				return
			case w.queue <- update:
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
		case update := <-w.queue:
			w.processUpdate(update)
		}
	}
}

func (w *updateWriter) processUpdate(update events.AnimeUpdateRequestedEvent) {
	if err := w.appendLine(w.filePath, update.Payload); err != nil {
		wrapped := fmt.Errorf("append anime update for %q: %w", update.AnimeID, err)
		if w.logger != nil {
			w.logger.Warnf("%v", wrapped)
		}
		w.setErr(wrapped)
		return
	}

	if w.selfEchoRegistry != nil {
		w.selfEchoRegistry.Remember(update.Payload)
	}

	if w.publisher != nil {
		w.publisher.Publish(events.AnimeChangedEvent{
			AnimeID: update.AnimeID,
			Payload: append([]byte(nil), update.Payload...),
		})
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
