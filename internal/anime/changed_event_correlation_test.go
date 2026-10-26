package anime

import (
	"reflect"
	"testing"

	"autoreas-bridge/internal/events"
)

// TestNewAnimeChangedEventCorrelatesWithItsChangelogRow carries the event id,
// which is also the changelog row's source event id, as the correlation id, so
// an anime.changed log line joins the changelog row that save stored.
func TestNewAnimeChangedEventCorrelatesWithItsChangelogRow(t *testing.T) {
	t.Parallel()

	got := newAnimeChangedEvent(CommittedChange{
		EventID:       "event-1",
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
		CorrelationID: "event-1",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("newAnimeChangedEvent = %#v, want %#v", got, want)
	}
}
