package tracerbullet

import (
	"fmt"
	"strings"
	"testing"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// TestRunnerTracesRealChangesWithoutPublishingAFakeOne pins that starting the
// tracer bullet announces nothing: anime.changed must only ever mean a committed
// row, so the runner traces the changes that really happen instead of
// inventing one for an anime that does not exist.
func TestRunnerTracesRealChangesWithoutPublishingAFakeOne(t *testing.T) {
	t.Parallel()

	sink := &memorySink{}
	bus := events.NewBus()
	announced := 0
	bus.Subscribe(events.EventNameAnimeChanged, func(events.Event) { announced++ })
	runner := NewRunner(bus, sink)

	runner.Start()
	if announced != 0 {
		t.Fatalf("expected starting the tracer bullet to publish no anime.changed, got %d", announced)
	}
	bus.Publish(events.AnimeChangedEvent{AnimeID: "anime-1"})

	got := sink.Messages()
	want := []string{
		"system: tracer bullet ready",
		"sync: received anime.changed for anime-1",
		"websocket: forwarded anime.changed for anime-1",
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
	bus.Publish(events.DownloadRunFinishedEvent{RunID: "tablet"})

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

// recordingLogger captures the structured entries the runner emits.
type recordingLogger struct {
	entries []sharedlogger.LogEntry
}

func (l *recordingLogger) Debugf(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelDebug, sharedlogger.Fields{}, format, args...)
}

func (l *recordingLogger) Infof(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelInfo, sharedlogger.Fields{}, format, args...)
}

func (l *recordingLogger) Warnf(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelWarn, sharedlogger.Fields{}, format, args...)
}

func (l *recordingLogger) Errorf(domain, format string, args ...any) {
	l.Logf(domain, sharedlogger.LevelError, sharedlogger.Fields{}, format, args...)
}

func (l *recordingLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entries = append(l.entries, sharedlogger.LogEntry{
		Domain:    domain,
		Level:     level,
		Message:   fmt.Sprintf(format, args...),
		EntityID:  fields.EntityID,
		EventType: fields.EventType,
	})
}

// TestRunnerDoesNotDeriveDomainFromMessageProse is the defect this fixes. The
// runner used to split its own sentence on ": " and pass the prefix as the log
// DOMAIN, which is why every `anime` row in runtime_events was a tracer bullet.
// A domain is a contract; prose changes for readability reasons.
func TestRunnerDoesNotDeriveDomainFromMessageProse(t *testing.T) {
	t.Parallel()

	log := &recordingLogger{}
	runner := NewRunner(events.NewBus(), &memorySink{}, log)
	runner.Start()

	if len(log.entries) == 0 {
		t.Fatal("expected the runner to log its trace")
	}
	for _, entry := range log.entries {
		if entry.Domain != "tracer-bullet" {
			t.Fatalf("expected every tracer entry in the %q domain, got %q for %q",
				"tracer-bullet", entry.Domain, entry.Message)
		}
	}
}

// TestRunnerMarksItsEntriesSynthetic proves a health rollup can exclude the
// tracer bullet. Without this, a dashboard reads "368 anime events, all
// healthy" while it is describing a demonstration harness.
func TestRunnerMarksItsEntriesSynthetic(t *testing.T) {
	t.Parallel()

	log := &recordingLogger{}
	runner := NewRunner(events.NewBus(), &memorySink{}, log)
	runner.Start()

	if len(log.entries) == 0 {
		t.Fatal("expected the runner to log its trace")
	}
	for _, entry := range log.entries {
		if entry.EntityID != "tracer-bullet-anime" {
			t.Fatalf("expected the synthetic entity id %q, got %q", "tracer-bullet-anime", entry.EntityID)
		}
		if entry.EventType != "tracer.step" {
			t.Fatalf("expected event type %q, got %q", "tracer.step", entry.EventType)
		}
	}
}
