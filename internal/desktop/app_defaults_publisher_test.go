package desktop

import (
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
)

// TestDefaultCommittedPublisherPublishesOnTheGivenBus pins the production
// factory: the publisher it builds announces drained writes on the bus it was
// handed, the one every anime.changed subscriber listens on.
func TestDefaultCommittedPublisherPublishesOnTheGivenBus(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	received := make(chan events.AnimeChangedEvent, 1)
	bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		if changed, ok := event.(events.AnimeChangedEvent); ok {
			received <- changed
		}
	})
	app := &App{}
	app.ensureAnimeRuntimeDependencies()

	app.newCommittedPublisher(bus).PublishCommitted(anime.CommittedChange{AnimeID: "anime-1", ChangeType: "create"})

	select {
	case event := <-received:
		if event.AnimeID != "anime-1" || event.ChangeType != "create" {
			t.Fatalf("expected the drained create for anime-1, got %#v", event)
		}
	default:
		t.Fatal("expected the default publisher to publish on the given bus")
	}
}
