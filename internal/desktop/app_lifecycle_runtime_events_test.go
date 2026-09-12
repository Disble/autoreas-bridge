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

// TestRegisterDeviceSyncRuntimeEventBridgeEmitsDeviceAcknowledgedToWailsRuntime
// pins the desktop half of the Connected Devices realtime fix
// (connected-devices-realtime spec, "Device acknowledgment publishes a
// realtime signal"): the bridge must emit the mapped contracts DTO, never the
// bare domain event, so a type assertion failure here catches an accidental
// copy of registerDownloadRuntimeEventBridge's raw-struct shape instead of
// registerAnimeRuntimeEventBridge's mapped-DTO shape (design.md Note H).
func TestRegisterDeviceSyncRuntimeEventBridgeEmitsDeviceAcknowledgedToWailsRuntime(t *testing.T) {
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

	app.registerDeviceSyncRuntimeEventBridge(context.Background())

	bus.Publish(events.DeviceAcknowledgedEvent{
		DeviceID:           "device-1",
		LastAckChangelogID: 42,
		LastSeenAtMs:       1700000000000,
		CorrelationID:      "corr-1",
	})

	if emitCount != 1 {
		t.Fatalf("expected exactly 1 runtime emit, got %d", emitCount)
	}
	if emittedName != events.EventNameSyncDeviceAcknowledged {
		t.Fatalf("expected event %q, got %q", events.EventNameSyncDeviceAcknowledged, emittedName)
	}
	notice, ok := emittedPayload.(contracts.DeviceAcknowledgedNotice)
	if !ok {
		t.Fatalf("expected contracts.DeviceAcknowledgedNotice payload, got %#v", emittedPayload)
	}
	want := contracts.DeviceAcknowledgedNotice{DeviceID: "device-1", LastSeenAtMs: 1700000000000}
	if notice != want {
		t.Fatalf("expected notice %#v, got %#v", want, notice)
	}
}

// TestRegisterDeviceSyncRuntimeEventBridgeIgnoresForeignEventTypes guards the
// type assertion: a non-DeviceAcknowledgedEvent published under the same
// name must not reach the frontend as a malformed notice.
func TestRegisterDeviceSyncRuntimeEventBridgeIgnoresForeignEventTypes(t *testing.T) {
	t.Parallel()

	emitCount := 0
	bus := events.NewBus()
	app := &App{
		ctx:      context.Background(),
		eventBus: bus,
		emitFn:   func(context.Context, string, ...any) { emitCount++ },
	}

	app.registerDeviceSyncRuntimeEventBridge(context.Background())
	bus.Publish(foreignDeviceAcknowledgedEvent{})

	if emitCount != 0 {
		t.Fatalf("expected no runtime emit for a foreign event type, got %d", emitCount)
	}
}

// foreignDeviceAcknowledgedEvent publishes under the
// sync.device_acknowledged name without being a DeviceAcknowledgedEvent.
type foreignDeviceAcknowledgedEvent struct{}

func (foreignDeviceAcknowledgedEvent) Name() string { return events.EventNameSyncDeviceAcknowledged }

// TestRegisterDeviceSyncRuntimeEventBridgeSkipsSubscribeWithNilBusOrEmitFn
// pins the construction-time guard (spec: "A nil bus or emit function
// degrades without crashing"): the bridge must never call Subscribe at all
// when either dependency is nil, for both nil combinations.
func TestRegisterDeviceSyncRuntimeEventBridgeSkipsSubscribeWithNilBusOrEmitFn(t *testing.T) {
	t.Parallel()

	t.Run("nil event bus", func(t *testing.T) {
		t.Parallel()
		app := &App{
			ctx:      context.Background(),
			eventBus: nil,
			emitFn:   func(context.Context, string, ...any) {},
		}

		// A nil eventBus would panic on Subscribe if the construction-time
		// guard were missing -- reaching this line proves it fired.
		app.registerDeviceSyncRuntimeEventBridge(context.Background())
	})

	t.Run("nil emit function", func(t *testing.T) {
		t.Parallel()
		bus := &subscribeSpyBus{}
		app := &App{
			ctx:      context.Background(),
			eventBus: bus,
			emitFn:   nil,
		}

		app.registerDeviceSyncRuntimeEventBridge(context.Background())

		// The inner callback guard would also catch a nil a.emitFn, so "no
		// panic" alone cannot distinguish a construction-time skip from a
		// Subscribe call that never fires its handler. Assert directly that
		// Subscribe itself was never reached.
		if bus.subscribeCalls != 0 {
			t.Fatalf("expected Subscribe to never be called with a nil emitFn, got %d call(s)", bus.subscribeCalls)
		}
	})
}

// subscribeSpyBus is a minimal events.Bus double that records whether
// Subscribe was ever invoked, letting a guard test observe the
// construction-time skip directly instead of only inferring it from the
// absence of a panic.
type subscribeSpyBus struct {
	subscribeCalls int
}

func (b *subscribeSpyBus) Publish(events.Event) {}

func (b *subscribeSpyBus) Subscribe(string, events.Handler) func() {
	b.subscribeCalls++
	return func() {}
}

// TestRegisterDeviceSyncRuntimeEventBridgeSkipsEmitWithNilCtxInsideCallback
// pins the second, distinct guard site: the bridge IS subscribed (both
// dependencies were non-nil at registration), but the emit context or emit
// function turns nil before the callback fires. Both branches of that
// re-check are exercised separately.
func TestRegisterDeviceSyncRuntimeEventBridgeSkipsEmitWithNilCtxInsideCallback(t *testing.T) {
	t.Parallel()

	t.Run("nil emit context on both app.ctx and the registration ctx", func(t *testing.T) {
		t.Parallel()
		emitCount := 0
		bus := events.NewBus()
		app := &App{
			ctx:      nil,
			eventBus: bus,
			emitFn:   func(context.Context, string, ...any) { emitCount++ },
		}

		app.registerDeviceSyncRuntimeEventBridge(nil) //nolint:staticcheck // deliberately nil to force the fallback guard

		bus.Publish(events.DeviceAcknowledgedEvent{DeviceID: "device-1", LastSeenAtMs: 1})

		if emitCount != 0 {
			t.Fatalf("expected no runtime emit with a nil emit context, got %d", emitCount)
		}
	})

	t.Run("nil app.ctx falls back to the registration ctx and still emits", func(t *testing.T) {
		t.Parallel()
		emitCount := 0
		bus := events.NewBus()
		app := &App{
			ctx:      nil,
			eventBus: bus,
			emitFn:   func(context.Context, string, ...any) { emitCount++ },
		}

		app.registerDeviceSyncRuntimeEventBridge(context.Background())

		bus.Publish(events.DeviceAcknowledgedEvent{DeviceID: "device-1", LastSeenAtMs: 1})

		if emitCount != 1 {
			t.Fatalf("expected the registration ctx fallback to still emit once, got %d", emitCount)
		}
	})

	t.Run("nil emit function set after subscribing", func(t *testing.T) {
		t.Parallel()
		bus := events.NewBus()
		app := &App{
			ctx:      context.Background(),
			eventBus: bus,
			emitFn:   func(context.Context, string, ...any) {},
		}

		app.registerDeviceSyncRuntimeEventBridge(context.Background())
		app.emitFn = nil

		// Publishing must not panic: the callback re-checks a.emitFn even
		// though the construction-time guard already saw a non-nil value.
		bus.Publish(events.DeviceAcknowledgedEvent{DeviceID: "device-1", LastSeenAtMs: 1})
	})
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
