package sync

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
)

func TestChangelogRecorderPersistsAnimeChangedEvents(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	recorder := NewChangelogRecorder(bus, store)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	recorder.Start(ctx)

	event := events.AnimeChangedEvent{AnimeID: "anime-1", Payload: []byte(`{"_id":"anime-1"}`)}
	bus.Publish(event)

	eventuallySync(t, func() bool {
		return store.insertCalls == 1
	})

	if store.lastEvent.AnimeID != event.AnimeID {
		t.Fatalf("expected anime id %q, got %q", event.AnimeID, store.lastEvent.AnimeID)
	}

	recorder.Stop()
}

func TestChangelogRecorderIgnoresUnrelatedEvents(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	recorder := NewChangelogRecorder(bus, store)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	recorder.Start(ctx)

	bus.Publish(events.SyncRequestedEvent{Requester: "tablet"})

	if store.insertCalls != 0 {
		t.Fatalf("expected unrelated event to be ignored, got %d inserts", store.insertCalls)
	}

	recorder.Stop()
}

func TestChangelogRecorderStoresInsertErrors(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	wantErr := errors.New("sqlite locked")
	store := &stubChangelogStore{err: wantErr}
	recorder := NewChangelogRecorder(bus, store)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	recorder.Start(ctx)

	bus.Publish(events.AnimeChangedEvent{AnimeID: "anime-1", Payload: []byte(`{"_id":"anime-1"}`)})

	eventuallySync(t, func() bool {
		return recorder.Err() != nil
	})

	if !errors.Is(recorder.Err(), wantErr) {
		t.Fatalf("expected recorder err %v, got %v", wantErr, recorder.Err())
	}

	recorder.Stop()
}

type stubChangelogStore struct {
	insertCalls int
	lastEvent   events.AnimeChangedEvent
	err         error
}

func (s *stubChangelogStore) InsertPending(_ context.Context, event events.AnimeChangedEvent) error {
	s.insertCalls++
	s.lastEvent = event
	return s.err
}

func eventuallySync(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(300 * time.Millisecond)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !condition() {
		t.Fatal("condition not satisfied before timeout")
	}
}
