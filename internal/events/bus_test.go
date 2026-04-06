package events

import (
	"testing"
	"time"
)

func TestBusPublishesToSubscriber(t *testing.T) {
	bus := NewBus()
	got := make(chan Event, 1)

	bus.Subscribe(EventNameSyncRequested, func(event Event) {
		got <- event
	})

	bus.Publish(SyncRequestedEvent{Requester: "tablet"})

	select {
	case event := <-got:
		request, ok := event.(SyncRequestedEvent)
		if !ok {
			t.Fatalf("expected SyncRequestedEvent, got %T", event)
		}

		if request.Requester != "tablet" {
			t.Fatalf("expected requester tablet, got %q", request.Requester)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected published event to reach subscriber")
	}
}

func TestBusPublishesToMultipleSubscribers(t *testing.T) {
	bus := NewBus()
	first := make(chan Event, 1)
	second := make(chan Event, 1)

	bus.Subscribe(EventNameAnimeChanged, func(event Event) {
		first <- event
	})
	bus.Subscribe(EventNameAnimeChanged, func(event Event) {
		second <- event
	})

	published := AnimeChangedEvent{AnimeID: "abc123", Payload: []byte(`{"nombre":"Bleach"}`)}
	bus.Publish(published)

	assertAnimeChangedEvent(t, <-first, published.AnimeID, string(published.Payload))
	assertAnimeChangedEvent(t, <-second, published.AnimeID, string(published.Payload))
}

func TestBusUnsubscribeStopsOnlyRemovedSubscriber(t *testing.T) {
	bus := NewBus()
	removed := make(chan Event, 1)
	active := make(chan Event, 1)

	unsubscribe := bus.Subscribe(EventNameAnimeUpdateRequested, func(event Event) {
		removed <- event
	})
	bus.Subscribe(EventNameAnimeUpdateRequested, func(event Event) {
		active <- event
	})

	unsubscribe()
	bus.Publish(AnimeUpdateRequestedEvent{AnimeID: "one-piece"})

	select {
	case event := <-removed:
		t.Fatalf("expected removed subscriber to receive nothing, got %T", event)
	case <-time.After(50 * time.Millisecond):
	}

	select {
	case event := <-active:
		update, ok := event.(AnimeUpdateRequestedEvent)
		if !ok {
			t.Fatalf("expected AnimeUpdateRequestedEvent, got %T", event)
		}

		if update.AnimeID != "one-piece" {
			t.Fatalf("expected anime id one-piece, got %q", update.AnimeID)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected active subscriber to keep receiving events")
	}
}

func TestBusPublishWithoutSubscribersDoesNotPanic(t *testing.T) {
	bus := NewBus()

	bus.Publish(SyncRequestedEvent{Requester: "nobody"})
}

func TestBusDoesNotDeliverDifferentEventName(t *testing.T) {
	bus := NewBus()
	got := make(chan Event, 1)

	bus.Subscribe(EventNameSyncRequested, func(event Event) {
		got <- event
	})

	bus.Publish(AnimeChangedEvent{AnimeID: "abc123"})

	select {
	case event := <-got:
		t.Fatalf("expected no event for different event name, got %T", event)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestBusUnsubscribeIsIdempotent(t *testing.T) {
	bus := NewBus()
	got := make(chan Event, 1)

	unsubscribe := bus.Subscribe(EventNameSyncRequested, func(event Event) {
		got <- event
	})

	unsubscribe()
	unsubscribe()
	bus.Publish(SyncRequestedEvent{Requester: "tablet"})

	select {
	case event := <-got:
		t.Fatalf("expected no event after double unsubscribe, got %T", event)
	case <-time.After(50 * time.Millisecond):
	}
}

func assertAnimeChangedEvent(t *testing.T, event Event, wantAnimeID string, wantPayload string) {
	t.Helper()

	changed, ok := event.(AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", event)
	}

	if changed.AnimeID != wantAnimeID {
		t.Fatalf("expected anime id %q, got %q", wantAnimeID, changed.AnimeID)
	}

	if string(changed.Payload) != wantPayload {
		t.Fatalf("expected payload %q, got %q", wantPayload, string(changed.Payload))
	}
}
