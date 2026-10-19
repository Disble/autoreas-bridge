package events

import (
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// TestInstrumentedBusLogsTheCorrelationIDOfACorrelatedEvent stamps the publish
// record with the id a correlated event carries, and leaves every other event's
// record exactly as before: no correlation id, the same name metadata.
func TestInstrumentedBusLogsTheCorrelationIDOfACorrelatedEvent(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		event Event
		want  string
	}{
		{name: "correlated", event: AnimeChangedEvent{AnimeID: "anime-1", CorrelationID: "operation-1"}, want: "operation-1"},
		{name: "correlated without an id", event: AnimeChangedEvent{AnimeID: "anime-1"}, want: ""},
		{name: "not correlated", event: SyncRequestedEvent{Requester: "tablet"}, want: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			logger := &recordingBusLogger{}
			NewInstrumentedBus(NewBus(), logger).Publish(tc.event)

			if len(logger.entries) != 1 {
				t.Fatalf("expected one publish record, got %#v", logger.entries)
			}
			entry := logger.entries[0]
			if entry.CorrelationID != tc.want {
				t.Fatalf("correlation id = %q, want %q", entry.CorrelationID, tc.want)
			}
			if entry.Level != sharedlogger.LevelDebug || entry.EventType != busPublishEventType {
				t.Fatalf("expected a debug bus.publish record, got %#v", entry)
			}
			if entry.Metadata["eventName"] != tc.event.Name() || len(entry.Metadata) != 1 {
				t.Fatalf("expected metadata to hold only the event name, got %#v", entry.Metadata)
			}
		})
	}
}
