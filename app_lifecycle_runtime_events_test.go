package main

import (
	"context"
	"testing"

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
		emitFn: func(_ context.Context, eventName string, optionalData ...interface{}) {
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

func TestAppShutdownStopsHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := &App{httpServer: server}

	app.shutdown(context.Background())

	if !server.stopped {
		t.Fatal("expected shutdown to stop http server")
	}
}
