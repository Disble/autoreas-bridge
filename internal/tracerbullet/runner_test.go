package tracerbullet

import (
	"strings"
	"testing"

	"autoreas-bridge/internal/events"
)

func TestRunnerRecordsFullDummyEventFlow(t *testing.T) {
	t.Parallel()

	sink := &memorySink{}
	runner := NewRunner(events.NewBus(), sink)

	runner.Start()

	got := sink.Messages()
	want := []string{
		"system: tracer bullet ready",
		"anime: publishing anime.changed for tracer-bullet-anime",
		"sync: received anime.changed for tracer-bullet-anime",
		"websocket: forwarded anime.changed for tracer-bullet-anime",
	}

	if len(got) != len(want) {
		t.Fatalf("expected %d messages, got %d: %v", len(want), len(got), got)
	}

	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("message %d: expected %q, got %q", i, want[i], got[i])
		}
	}
}

func TestRunnerIgnoresDifferentEventNamesForWebSocketTrace(t *testing.T) {
	t.Parallel()

	sink := &memorySink{}
	bus := events.NewBus()
	runner := NewRunner(bus, sink)

	runner.StartSubscriptions()
	bus.Publish(events.AnimeUpdateRequestedEvent{AnimeID: "tablet"})

	for _, msg := range sink.Messages() {
		if strings.Contains(msg, "websocket:") {
			t.Fatalf("expected websocket trace to ignore unrelated events, got %q", msg)
		}
	}
}

type memorySink struct {
	messages []string
}

func (m *memorySink) Record(message string) {
	m.messages = append(m.messages, message)
}

func (m *memorySink) Messages() []string {
	cloned := make([]string, len(m.messages))
	copy(cloned, m.messages)
	return cloned
}
