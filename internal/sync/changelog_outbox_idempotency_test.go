package sync

import (
	"context"
	"testing"

	"autoreas-bridge/internal/events"
)

func TestChangelogRecorderDeduplicatesStableAnimeChangedEventID(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	bus := events.NewBus()
	recorder := NewChangelogRecorder(bus, store)
	ctx := context.Background()
	recorder.Start(ctx)
	t.Cleanup(recorder.Stop)

	event := events.AnimeChangedEvent{
		EventID: "operation-replayed",
		AnimeID: "anime-1",
		Payload: []byte(`{"_id":"anime-1"}`),
	}
	bus.Publish(event)
	bus.Publish(event)

	entries, err := store.ListAfterID(ctx, 0)
	if err != nil {
		t.Fatalf("list replayed changelog: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected stable replay to create one changelog row, got %#v", entries)
	}
	if entries[0].SourceEventID != event.EventID {
		t.Fatalf("expected source event id %q, got %#v", event.EventID, entries[0])
	}
}
