package anime_test

import (
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
)

// recordingEventPublisher captures every event published on it.
type recordingEventPublisher struct {
	events []events.Event
}

func (p *recordingEventPublisher) Publish(event events.Event) {
	p.events = append(p.events, event)
}

// TestCommittedPublisherPublishesTheDrainedEventOnTheBus pins the one remaining
// way an anime.changed event leaves the write path: the drained outbox row
// becomes exactly one bus event carrying its identity, derived change type,
// changed fields and payload, and later changes to the row do not leak into it.
func TestCommittedPublisherPublishesTheDrainedEventOnTheBus(t *testing.T) {
	t.Parallel()

	bus := &recordingEventPublisher{}
	row := anime.ChangedOutboxEvent{
		EventID: "event-1", AnimeID: "anime-1", Payload: []byte(`{"id":"anime-1"}`),
		ChangeType: "create", ChangedFields: []string{"name", "folder"},
	}

	anime.NewCommittedPublisher(bus).PublishCommitted(row)
	row.Payload[0] = 'X'
	row.ChangedFields[0] = "mutated"

	want := []events.Event{events.AnimeChangedEvent{
		EventID: "event-1", AnimeID: "anime-1", Payload: []byte(`{"id":"anime-1"}`),
		ChangeType: "create", ChangedFields: []string{"name", "folder"},
	}}
	if !reflect.DeepEqual(bus.events, want) {
		t.Fatalf("expected %#v, got %#v", want, bus.events)
	}
}

// TestCommittedPublisherWithoutABusPublishesNothing proves a publisher built
// over no bus is a safe no-op rather than a panic.
func TestCommittedPublisherWithoutABusPublishesNothing(t *testing.T) {
	t.Parallel()

	anime.NewCommittedPublisher(nil).PublishCommitted(anime.ChangedOutboxEvent{AnimeID: "anime-1"})
}
