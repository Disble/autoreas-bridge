package anime

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestSelfEchoRegistryConsumesOnlyOwnPayloads(t *testing.T) {
	t.Parallel()

	registry := NewSelfEchoRegistry()
	payload := []byte(`{"_id":"anime-1","nombre":"Own","nrocapvisto":1}`)
	other := []byte(`{"_id":"anime-2","nombre":"Other","nrocapvisto":2}`)

	registry.Remember(payload)

	if !registry.ConsumeIfPresent(payload) {
		t.Fatal("expected remembered payload to be consumed")
	}

	if registry.ConsumeIfPresent(payload) {
		t.Fatal("expected payload to be consumed only once")
	}

	if registry.ConsumeIfPresent(other) {
		t.Fatal("expected unrelated payload to remain visible to watcher")
	}
}

func TestUpdateWriterPublishesConfirmationAfterAppend(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	publisher := &recordingPublisher{}
	selfEcho := NewSelfEchoRegistry()
	shared := &recordingSharedLogger{}
	appended := make(chan []byte, 1)
	writer := NewUpdateWriter(UpdateWriterConfig{
		FilePath:         "data/animes.dat",
		Bus:              bus,
		Publisher:        publisher,
		SharedLogger:     shared,
		SelfEchoRegistry: selfEcho,
		AppendLine: func(_ string, payload []byte) error {
			appended <- append([]byte(nil), payload...)
			return nil
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer.StartAsync(ctx)

	payload := []byte(`{"_id":"anime-1","nombre":"Own","nrocapvisto":1}`)
	bus.Publish(events.AnimeUpdateRequestedEvent{AnimeID: "anime-1", Payload: payload})

	select {
	case got := <-appended:
		if string(got) != string(payload) {
			t.Fatalf("expected appended payload %s, got %s", string(payload), string(got))
		}
	case <-time.After(300 * time.Millisecond):
		t.Fatal("expected writer to append payload")
	}

	eventually(t, func() bool {
		return len(publisher.events()) == 1
	})

	assertPublishedAnimeChanged(t, publisher.events()[0], "anime-1", string(payload))

	if !selfEcho.ConsumeIfPresent(payload) {
		t.Fatal("expected writer to register payload for self-echo filtering")
	}

	cancel()
	writer.Wait()
}

func TestUpdateWriterSerializesConcurrentEvents(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	publisher := &recordingPublisher{}
	shared := &recordingSharedLogger{}
	var currentConcurrent int32
	var maxConcurrent int32
	var writeCount int32
	writer := NewUpdateWriter(UpdateWriterConfig{
		FilePath:         "data/animes.dat",
		Bus:              bus,
		Publisher:        publisher,
		SharedLogger:     shared,
		SelfEchoRegistry: NewSelfEchoRegistry(),
		AppendLine: func(_ string, payload []byte) error {
			_ = payload
			active := atomic.AddInt32(&currentConcurrent, 1)
			defer atomic.AddInt32(&currentConcurrent, -1)
			for {
				seen := atomic.LoadInt32(&maxConcurrent)
				if active <= seen || atomic.CompareAndSwapInt32(&maxConcurrent, seen, active) {
					break
				}
			}
			time.Sleep(5 * time.Millisecond)
			atomic.AddInt32(&writeCount, 1)
			return nil
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer.StartAsync(ctx)

	const total = 50
	var wg sync.WaitGroup
	for i := 0; i < total; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			payload := []byte(fmt.Sprintf(`{"_id":"anime-%d","nombre":"Anime %d","nrocapvisto":%d}`, i, i, i))
			bus.Publish(events.AnimeUpdateRequestedEvent{AnimeID: fmt.Sprintf("anime-%d", i), Payload: payload})
		}(i)
	}
	wg.Wait()

	eventuallyWithin(t, 2*time.Second, func() bool {
		return atomic.LoadInt32(&writeCount) == total
	})

	if got := atomic.LoadInt32(&maxConcurrent); got != 1 {
		t.Fatalf("expected max concurrent writes 1, got %d", got)
	}

	if got := len(publisher.events()); got != total {
		t.Fatalf("expected %d confirmation events, got %d", total, got)
	}

	cancel()
	writer.Wait()
}

func TestUpdateWriterStoresTerminalErrorWhenAppendFails(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("disk full")
	bus := events.NewBus()
	writer := NewUpdateWriter(UpdateWriterConfig{
		FilePath: "data/animes.dat",
		Bus:      bus,
		AppendLine: func(string, []byte) error {
			return wantErr
		},
		Logger: &recordingWarningLogger{},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer.StartAsync(ctx)
	bus.Publish(events.AnimeUpdateRequestedEvent{AnimeID: "anime-1", Payload: []byte(`{"_id":"anime-1"}`)})

	eventually(t, func() bool {
		return writer.Err() != nil
	})

	if !errors.Is(writer.Err(), wantErr) {
		t.Fatalf("expected writer error %v, got %v", wantErr, writer.Err())
	}

	cancel()
	writer.Wait()
}

func TestUpdateWriterRequestWriteReturnsAppendErrorAndPublishesFailureEvent(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("disk full")
	bus := events.NewBus()
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	writer := NewUpdateWriter(UpdateWriterConfig{
		FilePath:         "data/animes.dat",
		Bus:              bus,
		Publisher:        publisher,
		Logger:           logger,
		SharedLogger:     shared,
		SelfEchoRegistry: NewSelfEchoRegistry(),
		AppendLine: func(string, []byte) error {
			return wantErr
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer.StartAsync(ctx)

	err := writer.RequestWrite(ctx, "anime-1", []byte(`{"_id":"anime-1"}`))
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected request write error %v, got %v", wantErr, err)
	}

	eventsList := publisher.events()
	if len(eventsList) != 1 {
		t.Fatalf("expected 1 failure event, got %d", len(eventsList))
	}

	failed, ok := eventsList[0].(events.AnimeWriteFailedEvent)
	if !ok {
		t.Fatalf("expected AnimeWriteFailedEvent, got %T", eventsList[0])
	}

	if failed.AnimeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", failed.AnimeID)
	}

	if failed.Path != "data/animes.dat" {
		t.Fatalf("expected path %q, got %q", "data/animes.dat", failed.Path)
	}

	if failed.Err == "" {
		t.Fatal("expected failure event to include error message")
	}

	if len(logger.messages()) == 0 {
		t.Fatal("expected append failure to be logged")
	}

	entries := shared.entries()
	if len(entries) == 0 || entries[0].Domain != "anime" || entries[0].Level != sharedlogger.LevelWarn {
		t.Fatalf("expected anime warn structured log, got %#v", entries)
	}

	cancel()
	writer.Wait()
}
