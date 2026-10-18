package anime

import (
	"reflect"
	"testing"

	"autoreas-bridge/internal/events"
)

// TestNewAnimeChangedEventCorrelatesWithItsWriteOperation carries the outbox
// row's operation id as the event's correlation id, so an anime.changed log
// line joins the write operation, and through it the request, that caused it.
func TestNewAnimeChangedEventCorrelatesWithItsWriteOperation(t *testing.T) {
	t.Parallel()

	got := newAnimeChangedEvent(ChangedOutboxEvent{
		EventID:       "event-1",
		OperationID:   "operation-1",
		AnimeID:       "anime-1",
		Payload:       []byte(`{"id":"anime-1"}`),
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"episodes"},
	})

	want := events.AnimeChangedEvent{
		EventID:       "event-1",
		AnimeID:       "anime-1",
		Payload:       []byte(`{"id":"anime-1"}`),
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"episodes"},
		CorrelationID: "operation-1",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("newAnimeChangedEvent = %#v, want %#v", got, want)
	}
}
