package desktop

import (
	"context"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

func TestRegisterDownloadRuntimeEventBridgeEmitsRunLifecycleEventsToWailsRuntime(t *testing.T) {
	t.Parallel()

	type emittedEvent struct {
		name    string
		payload any
	}

	emitted := []emittedEvent{}
	bus := events.NewBus()
	app := &App{
		ctx:      context.Background(),
		eventBus: bus,
		emitFn: func(_ context.Context, eventName string, optionalData ...any) {
			var payload any
			if len(optionalData) > 0 {
				payload = optionalData[0]
			}
			emitted = append(emitted, emittedEvent{name: eventName, payload: payload})
		},
	}

	app.registerDownloadRuntimeEventBridge(context.Background())

	started := events.DownloadRunStartedEvent{RunID: "run-1", Trigger: "manual", CorrelationID: "run-1"}
	progress := events.DownloadRunProgressEvent{RunID: "run-1", CorrelationID: "run-1"}
	finished := events.DownloadRunFinishedEvent{RunID: "run-1", Status: "ok", CorrelationID: "run-1"}
	bus.Publish(started)
	bus.Publish(progress)
	bus.Publish(finished)

	if len(emitted) != 3 {
		t.Fatalf("expected 3 runtime events, got %d: %#v", len(emitted), emitted)
	}
	if emitted[0].name != events.EventNameDownloadRunStarted {
		t.Fatalf("expected first event %q, got %q", events.EventNameDownloadRunStarted, emitted[0].name)
	}
	if got, ok := emitted[0].payload.(events.DownloadRunStartedEvent); !ok || got != started {
		t.Fatalf("expected started payload %#v, got %#v", started, emitted[0].payload)
	}
	if emitted[1].name != events.EventNameDownloadRunProgress {
		t.Fatalf("expected second event %q, got %q", events.EventNameDownloadRunProgress, emitted[1].name)
	}
	if got, ok := emitted[1].payload.(events.DownloadRunProgressEvent); !ok || got != progress {
		t.Fatalf("expected progress payload %#v, got %#v", progress, emitted[1].payload)
	}
	if emitted[2].name != events.EventNameDownloadRunFinished {
		t.Fatalf("expected third event %q, got %q", events.EventNameDownloadRunFinished, emitted[2].name)
	}
	if got, ok := emitted[2].payload.(events.DownloadRunFinishedEvent); !ok || got != finished {
		t.Fatalf("expected finished payload %#v, got %#v", finished, emitted[2].payload)
	}
}

// TestRegisterAnimeRuntimeEventBridgeEmitsAnimeChangedToWailsRuntime pins the
// desktop half of anime change fan-out: anime.changed already reaches the
// realtime hub (mobile WS), but the Wails frontend never saw it, so panels
// only refreshed on remount. The bridge emits a slim notice -- never the raw
// snapshot Payload -- because the UI only needs to know what to re-fetch.
func TestRegisterAnimeRuntimeEventBridgeEmitsAnimeChangedToWailsRuntime(t *testing.T) {
	t.Parallel()

	emittedName := ""
	var emittedPayload any
	emitCount := 0
	bus := events.NewBus()
	app := &App{
		ctx:      context.Background(),
		eventBus: bus,
		emitFn: func(_ context.Context, eventName string, optionalData ...any) {
			emitCount++
			emittedName = eventName
			if len(optionalData) > 0 {
				emittedPayload = optionalData[0]
			}
		},
	}

	app.registerAnimeRuntimeEventBridge(context.Background())

	bus.Publish(events.AnimeChangedEvent{
		EventID:       "evt-1",
		AnimeID:       "anime-1",
		Payload:       []byte(`{"heavy":"snapshot"}`),
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"episodesWatched"},
		CorrelationID: "corr-1",
	})

	if emitCount != 1 {
		t.Fatalf("expected exactly 1 runtime emit, got %d", emitCount)
	}
	if emittedName != events.EventNameAnimeChanged {
		t.Fatalf("expected event %q, got %q", events.EventNameAnimeChanged, emittedName)
	}
	notice, ok := emittedPayload.(contracts.AnimeChangedNotice)
	if !ok {
		t.Fatalf("expected contracts.AnimeChangedNotice payload, got %#v", emittedPayload)
	}
	want := contracts.AnimeChangedNotice{
		AnimeID:       "anime-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"episodesWatched"},
		CorrelationID: "corr-1",
	}
	if notice.AnimeID != want.AnimeID || notice.ChangeType != want.ChangeType || notice.CorrelationID != want.CorrelationID {
		t.Fatalf("expected notice %#v, got %#v", want, notice)
	}
	if len(notice.ChangedFields) != 1 || notice.ChangedFields[0] != "episodesWatched" {
		t.Fatalf("expected changed fields [episodesWatched], got %#v", notice.ChangedFields)
	}
}

// TestRegisterAnimeRuntimeEventBridgeIgnoresForeignEventTypes guards the type
// assertion: a non-AnimeChangedEvent published under the same name must not
// reach the frontend as a malformed notice.
func TestRegisterAnimeRuntimeEventBridgeIgnoresForeignEventTypes(t *testing.T) {
	t.Parallel()

	emitCount := 0
	bus := events.NewBus()
	app := &App{
		ctx:      context.Background(),
		eventBus: bus,
		emitFn:   func(context.Context, string, ...any) { emitCount++ },
	}

	app.registerAnimeRuntimeEventBridge(context.Background())
	bus.Publish(foreignAnimeChangedEvent{})

	if emitCount != 0 {
		t.Fatalf("expected no runtime emit for a foreign event type, got %d", emitCount)
	}
}

// foreignAnimeChangedEvent publishes under the anime.changed name without
// being an AnimeChangedEvent.
type foreignAnimeChangedEvent struct{}

func (foreignAnimeChangedEvent) Name() string { return events.EventNameAnimeChanged }

func TestAppShutdownStopsHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := &App{httpServer: server}

	app.shutdown(context.Background())

	if !server.stopped {
		t.Fatal("expected shutdown to stop http server")
	}
}
