package sync

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestChangelogRecorderPersistsAnimeChangedEvents(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	logger := &recordingSyncLogger{}
	recorder := NewChangelogRecorder(bus, store, logger)
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
	if string(store.lastEvent.SnapshotJSON) != string(event.Payload) {
		t.Fatalf("expected payload %s, got %s", string(event.Payload), string(store.lastEvent.SnapshotJSON))
	}
	if store.lastEvent.Status != "pending" {
		t.Fatalf("expected status pending, got %q", store.lastEvent.Status)
	}
	if store.lastEvent.ChangeType != ChangelogTypeUpdate {
		t.Fatalf("expected update change type, got %q", store.lastEvent.ChangeType)
	}
	if store.lastEvent.ChangedAtMs == 0 {
		t.Fatal("expected changed timestamp to be stamped")
	}

	entries := logger.entries()
	if len(entries) == 0 || entries[0].Domain != "sync" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected sync info log for changelog insert, got %#v", entries)
	}

	insertEntry := entries[0]
	if insertEntry.EntityID != "anime-1" {
		t.Fatalf("expected EntityID 'anime-1', got %q", insertEntry.EntityID)
	}
	if insertEntry.EventType != "sync.changelog" {
		t.Fatalf("expected EventType 'sync.changelog', got %q", insertEntry.EventType)
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
	logger := &recordingSyncLogger{}
	recorder := NewChangelogRecorder(bus, store, logger)
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

	entries := logger.entries()
	if len(entries) == 0 || entries[len(entries)-1].Level != sharedlogger.LevelError {
		t.Fatalf("expected sync error log for insert failure, got %#v", entries)
	}

	recorder.Stop()
}

func TestChangelogRecorderPersistsDeleteChangeType(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	recorder := NewChangelogRecorder(bus, store)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	recorder.Start(ctx)

	bus.Publish(events.AnimeChangedEvent{AnimeID: "anime-1", ChangeType: events.AnimeChangeTypeDelete})

	eventuallySync(t, func() bool {
		return store.insertCalls == 1
	})

	if store.lastEvent.ChangeType != ChangelogTypeDelete {
		t.Fatalf("expected delete change type, got %q", store.lastEvent.ChangeType)
	}
	if store.lastEvent.SnapshotJSON != nil {
		t.Fatalf("expected nil snapshot for delete, got %s", string(store.lastEvent.SnapshotJSON))
	}

	recorder.Stop()
}

type stubChangelogStore struct {
	insertCalls int
	lastEvent   ChangelogEntry
	err         error
}

func (s *stubChangelogStore) InsertPending(_ context.Context, event ChangelogEntry) error {
	s.insertCalls++
	s.lastEvent = event
	return s.err
}

// eventuallySync waits for an asynchronous sync condition to become true.
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
