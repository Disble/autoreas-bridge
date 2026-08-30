package sync

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"

	"autoreas-bridge/internal/testsupport/async"
)

func TestChangelogRecorderPersistsAnimeChangedEvents(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	logger := &recordingSyncLogger{}
	recorder := NewChangelogRecorder(bus, store, logger)
	ctx := t.Context()
	recorder.Start(ctx)

	event := events.AnimeChangedEvent{AnimeID: "anime-1", Payload: []byte(`{"id":"anime-1"}`)}
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
	ctx := t.Context()
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
	ctx := t.Context()
	recorder.Start(ctx)

	bus.Publish(events.AnimeChangedEvent{AnimeID: "anime-1", Payload: []byte(`{"id":"anime-1"}`)})

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
	ctx := t.Context()
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
	async.Eventually(t, condition, "condition not satisfied before timeout")
}

// TestChangelogRowRecordsDerivedChangedFieldsEndToEnd is the regression that
// matters most in this change. The incident's changelog row read
// `2225|update|[]|pending|...` -- an update declaring no changed fields that
// had just rewritten `days` from three entries to none. This drives a real
// SQLite changelog through the real store and asserts the persisted
// changed_fields_json is no longer an empty envelope.
func TestChangelogRowRecordsDerivedChangedFieldsEndToEnd(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	bus := events.NewBus()
	store := NewChangelogStore(NewSQLiteProvider(db))
	recorder := NewChangelogRecorder(bus, store, &recordingSyncLogger{})
	ctx := t.Context()
	recorder.Start(ctx)

	bus.Publish(events.AnimeChangedEvent{
		AnimeID:       "anime-endtoend",
		Payload:       []byte(`{"id":"anime-endtoend"}`),
		ChangedFields: []string{"cover", "days"},
	})

	var stored string
	eventuallySync(t, func() bool {
		return db.QueryRow(
			`SELECT changed_fields_json FROM changelog WHERE anime_id = ?`,
			"anime-endtoend",
		).Scan(&stored) == nil
	})

	if stored == "[]" {
		t.Fatal("changelog recorded an empty changed-field list: this is the incident shape")
	}
	if stored != `["cover","days"]` {
		t.Fatalf("expected %s, got %s", `["cover","days"]`, stored)
	}
}
