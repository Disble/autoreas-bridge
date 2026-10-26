package sync

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// TestChangelogRecorderLogsEachRecordedRow proves a recorded row is logged with
// the event that caused it, its change type and the fields it changed.
func TestChangelogRecorderLogsEachRecordedRow(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	logger := &recordingSyncLogger{}
	recorder := NewChangelogRecorder(bus, store, logger)
	recorder.Start(t.Context())
	t.Cleanup(recorder.Stop)

	bus.Publish(events.EpisodeDurationsChangedEvent{EventID: "evt-1", AnimeID: "anime-1", Payload: []byte(`{"id":"anime-1"}`)})

	entries := logger.entries()
	if len(entries) != 1 || entries[0].Domain != "sync" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected one sync info log for changelog insert, got %#v", entries)
	}
	if entries[0].EntityID != "anime-1" || entries[0].EventType != "sync.changelog" {
		t.Fatalf("expected the sync.changelog entry of anime-1, got %#v", entries[0])
	}
	wantMetadata := map[string]any{"sourceEventId": "evt-1", "changeType": ChangelogTypeUpdate, "changedFields": []string{"episodes"}}
	if !reflect.DeepEqual(entries[0].Metadata, wantMetadata) {
		t.Fatalf("expected metadata %#v, got %#v", wantMetadata, entries[0].Metadata)
	}
}

// TestChangelogRecorderIgnoresEveryOtherEvent proves the recorder stores no
// row for an anime.changed event: the save already stored that row inside its
// transaction, under the same source event id.
func TestChangelogRecorderIgnoresEveryOtherEvent(t *testing.T) {
	t.Parallel()

	for _, event := range []events.Event{
		events.SyncRequestedEvent{Requester: "tablet"},
		events.AnimeChangedEvent{EventID: "evt-1", AnimeID: "anime-1", ChangedFields: []string{"title"}, Payload: []byte(`{"id":"anime-1"}`)},
	} {
		bus := events.NewBus()
		store := &stubChangelogStore{}
		recorder := NewChangelogRecorder(bus, store)
		recorder.Start(t.Context())

		bus.Publish(event)
		recorder.Stop()

		if store.insertCalls != 0 {
			t.Fatalf("expected %T to be ignored, got %d inserts", event, store.insertCalls)
		}
	}
}

func TestChangelogRecorderStoresInsertErrors(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	wantErr := errors.New("sqlite locked")
	store := &stubChangelogStore{err: wantErr}
	logger := &recordingSyncLogger{}
	recorder := NewChangelogRecorder(bus, store, logger)
	recorder.Start(t.Context())
	t.Cleanup(recorder.Stop)

	bus.Publish(events.EpisodeDurationsChangedEvent{EventID: "evt-1", AnimeID: "anime-1", Payload: []byte(`{"id":"anime-1"}`)})

	if !errors.Is(recorder.Err(), wantErr) {
		t.Fatalf("expected recorder err %v, got %v", wantErr, recorder.Err())
	}
	entries := logger.entries()
	if len(entries) == 0 || entries[len(entries)-1].Level != sharedlogger.LevelError {
		t.Fatalf("expected sync error log for insert failure, got %#v", entries)
	}
	wantMetadata := map[string]any{"sourceEventId": "evt-1", "changeType": ChangelogTypeUpdate, "changedFields": []string{"episodes"}, "cause": "sqlite locked"}
	if got := entries[len(entries)-1].Metadata; !reflect.DeepEqual(got, wantMetadata) {
		t.Fatalf("expected metadata %#v, got %#v", wantMetadata, got)
	}
}

// TestChangelogRecorderDeduplicatesAReplayedEventID proves through the real
// store that a replayed announcement with the same event id stores one row.
func TestChangelogRecorderDeduplicatesAReplayedEventID(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	seedAnimeSnapshot(t, db, "anime-1", `{"id":"anime-1"}`)
	bus := events.NewBus()
	recorder := NewChangelogRecorder(bus, store)
	ctx := t.Context()
	recorder.Start(ctx)
	t.Cleanup(recorder.Stop)

	event := events.EpisodeDurationsChangedEvent{EventID: "episode.durations_changed:anime-1:42", AnimeID: "anime-1"}
	bus.Publish(event)
	bus.Publish(event)

	entries, err := store.ListAfterID(ctx, 0)
	if err != nil {
		t.Fatalf("list replayed changelog: %v", err)
	}
	if len(entries) != 1 || entries[0].SourceEventID != event.EventID {
		t.Fatalf("expected one row with source event id %q, got %#v", event.EventID, entries)
	}
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

func TestChangelogRecorderRecordsEpisodeDurationsAsAnOrdinaryUpdateRow(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	recorder := NewChangelogRecorder(bus, store)
	recorder.Start(t.Context())

	event := events.EpisodeDurationsChangedEvent{
		EventID: "episode.durations_changed:anime-1:42",
		AnimeID: "anime-1",
		Payload: []byte(`{"_id":"anime-1"}`),
	}
	bus.Publish(event)

	if store.insertCalls != 1 {
		t.Fatalf("expected one changelog row, got %d", store.insertCalls)
	}
	got := store.lastEvent
	if got.SourceEventID != event.EventID || got.AnimeID != event.AnimeID {
		t.Fatalf("expected source event %q for %q, got %q for %q",
			event.EventID, event.AnimeID, got.SourceEventID, got.AnimeID)
	}
	if got.ChangeType != ChangelogTypeUpdate || got.Status != "pending" || got.ChangedAtMs == 0 {
		t.Fatalf("expected a stamped pending update row, got %+v", got)
	}
	if len(got.ChangedFields) != 1 || got.ChangedFields[0] != "episodes" {
		t.Fatalf("expected changed fields [episodes], got %v", got.ChangedFields)
	}
	if string(got.SnapshotJSON) != string(event.Payload) {
		t.Fatalf("expected the current snapshot %s, got %s", event.Payload, got.SnapshotJSON)
	}

	recorder.Stop()
	bus.Publish(event)
	if store.insertCalls != 1 {
		t.Fatalf("expected no row after Stop, got %d", store.insertCalls)
	}
}

func TestChangelogRecorderStampsRowsWithItsClock(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	store := &stubChangelogStore{}
	recorder := NewChangelogRecorder(bus, store)
	recorder.now = func() time.Time { return time.UnixMilli(1234) }
	recorder.Start(t.Context())
	t.Cleanup(recorder.Stop)

	bus.Publish(events.EpisodeDurationsChangedEvent{EventID: "e-1", AnimeID: "anime-1"})

	if store.lastEvent.ChangedAtMs != 1234 {
		t.Fatalf("expected the recorder clock to stamp the row, got %d", store.lastEvent.ChangedAtMs)
	}
}
