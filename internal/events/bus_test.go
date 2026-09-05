package events

import (
	"fmt"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
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

	published := AnimeChangedEvent{AnimeID: "abc123", Payload: []byte(`{"name":"Bleach"}`)}
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

// ── InstrumentedBus tests ────────────────────────────────────────────────────

type recordingBusLogger struct {
	entries []sharedlogger.LogEntry
}

func (l *recordingBusLogger) Debugf(domain, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingBusLogger) Infof(domain, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingBusLogger) Warnf(domain, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingBusLogger) Errorf(domain, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingBusLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{
		Domain:        domain,
		Level:         level,
		Message:       fmt.Sprintf(format, args...),
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	})
}

func TestInstrumentedBusLogsPublishAtDebugLevel(t *testing.T) {
	inner := NewBus()
	logger := &recordingBusLogger{}
	bus := NewInstrumentedBus(inner, logger)

	bus.Publish(SyncRequestedEvent{Requester: "tablet"})

	if len(logger.entries) == 0 {
		t.Fatal("expected instrumented bus to log publish event")
	}
	entry := logger.entries[0]
	if entry.Domain != "bus" {
		t.Fatalf("expected domain %q, got %q", "bus", entry.Domain)
	}
	if entry.Level != sharedlogger.LevelDebug {
		t.Fatalf("expected level %q, got %q", sharedlogger.LevelDebug, entry.Level)
	}
	if entry.EventType != "bus.publish" {
		t.Fatalf("expected event type %q, got %q", "bus.publish", entry.EventType)
	}
	if !strings.Contains(entry.Message, EventNameSyncRequested) {
		t.Fatalf("expected log message to contain event name %q, got %q", EventNameSyncRequested, entry.Message)
	}
	if entry.Metadata == nil || entry.Metadata["eventName"] != EventNameSyncRequested {
		t.Fatalf("expected metadata eventName %q, got %#v", EventNameSyncRequested, entry.Metadata)
	}
}

func TestInstrumentedBusSubscribeDelegates(t *testing.T) {
	inner := NewBus()
	logger := &recordingBusLogger{}
	bus := NewInstrumentedBus(inner, logger)

	got := make(chan Event, 1)
	unsub := bus.Subscribe(EventNameAnimeChanged, func(event Event) {
		got <- event
	})

	bus.Publish(AnimeChangedEvent{AnimeID: "abc"})

	select {
	case ev := <-got:
		if ev.(AnimeChangedEvent).AnimeID != "abc" {
			t.Fatalf("expected anime id %q, got %q", "abc", ev.(AnimeChangedEvent).AnimeID)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected subscriber to receive event through instrumented bus")
	}

	unsub()
}

// findSlowHandlerWarning returns the first slow-handler warning the recording
// logger captured. Keeping the search here lets the test assert on the entry
// as a flat sequence rather than threading a flag through a loop.
func findSlowHandlerWarning(entries []sharedlogger.LogEntry) (sharedlogger.LogEntry, bool) {
	for _, entry := range entries {
		if entry.Level == sharedlogger.LevelWarn && strings.Contains(entry.Message, "slow") {
			return entry, true
		}
	}
	return sharedlogger.LogEntry{}, false
}

func TestInstrumentedBusWarnsOnSlowHandler(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		inner := NewBus()
		logger := &recordingBusLogger{}
		bus := NewInstrumentedBus(inner, logger)

		bus.Subscribe(EventNameSyncRequested, func(event Event) {
			time.Sleep(600 * time.Millisecond)
		})

		bus.Publish(SyncRequestedEvent{Requester: "tablet"})

		entry, found := findSlowHandlerWarning(logger.entries)
		if !found {
			t.Fatal("expected instrumented bus to warn on slow handler (>500ms)")
		}
		if entry.DurationMs < 500 {
			t.Fatalf("expected slow-handler warning duration >= 500ms, got %d", entry.DurationMs)
		}
		if entry.Metadata == nil || entry.Metadata["eventName"] != EventNameSyncRequested {
			t.Fatalf("expected slow-handler metadata eventName %q, got %#v", EventNameSyncRequested, entry.Metadata)
		}
	})
}

func TestInstrumentedBusDoesNotWarnOnFastHandler(t *testing.T) {
	inner := NewBus()
	logger := &recordingBusLogger{}
	bus := NewInstrumentedBus(inner, logger)

	bus.Subscribe(EventNameSyncRequested, func(event Event) {
		// fast handler — no delay
	})

	bus.Publish(SyncRequestedEvent{Requester: "tablet"})

	for _, entry := range logger.entries {
		if entry.Level == sharedlogger.LevelWarn {
			t.Fatalf("expected no warn for fast handler, got %q", entry.Message)
		}
	}
}

// assertAnimeChangedEvent verifies the identity and payload of an anime change event.
func assertAnimeChangedEvent(t *testing.T, event Event, wantAnimeID, wantPayload string) {
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
