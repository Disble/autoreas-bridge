package events

import (
	"testing"
	"time"
)

// TestBusDeliversByNameToEverySubscriberUntilItUnsubscribes drives one bus: a
// publish without subscribers does not panic, an event reaches only the
// subscribers of its name, every subscriber of a name receives it, and an
// unsubscribed handler stops receiving while the others keep receiving.
func TestBusDeliversByNameToEverySubscriberUntilItUnsubscribes(t *testing.T) {
	bus := NewBus()
	bus.Publish(SyncRequestedEvent{Requester: "nobody"})

	sync := make(chan Event, 1)
	bus.Subscribe(EventNameSyncRequested, func(event Event) { sync <- event })
	bus.Publish(AnimeChangedEvent{AnimeID: "abc123"})
	assertNoEvent(t, sync, "expected no event for different event name")
	bus.Publish(SyncRequestedEvent{Requester: "tablet"})
	request, ok := receiveEvent(t, sync, "expected published event to reach subscriber").(SyncRequestedEvent)
	if !ok || request.Requester != "tablet" {
		t.Fatalf("expected SyncRequestedEvent from tablet, got %+v", request)
	}

	removed := make(chan Event, 1)
	active := make(chan Event, 1)
	unsubscribe := bus.Subscribe(EventNameAnimeChanged, func(event Event) { removed <- event })
	bus.Subscribe(EventNameAnimeChanged, func(event Event) { active <- event })
	published := AnimeChangedEvent{AnimeID: "abc123", Payload: []byte(`{"name":"Bleach"}`)}
	bus.Publish(published)
	assertAnimeChangedEvent(t, <-removed, published.AnimeID, string(published.Payload))
	assertAnimeChangedEvent(t, <-active, published.AnimeID, string(published.Payload))

	unsubscribe()
	bus.Publish(AnimeChangedEvent{AnimeID: "one-piece"})
	assertNoEvent(t, removed, "expected removed subscriber to receive nothing")
	update, ok := receiveEvent(t, active, "expected active subscriber to keep receiving events").(AnimeChangedEvent)
	if !ok || update.AnimeID != "one-piece" {
		t.Fatalf("expected AnimeChangedEvent one-piece, got %+v", update)
	}
}

// receiveEvent waits briefly for one event on got and fails with failure when none arrives.
func receiveEvent(t *testing.T, got <-chan Event, failure string) Event {
	t.Helper()

	select {
	case event := <-got:
		return event
	case <-time.After(100 * time.Millisecond):
		t.Fatal(failure)
		return nil
	}
}

// assertNoEvent fails with failure when an event arrives on got within a short wait.
func assertNoEvent(t *testing.T, got <-chan Event, failure string) {
	t.Helper()

	select {
	case event := <-got:
		t.Fatalf("%s, got %T", failure, event)
	case <-time.After(50 * time.Millisecond):
	}
}
