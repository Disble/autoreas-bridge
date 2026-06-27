package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/tray"
)

func TestAppStartupStartsTrayManagerWithIconCallbacksAndHide(t *testing.T) {
	t.Parallel()

	manager := &tray.MockTrayManager{}
	app := newTrayLifecycleTestApp(t, manager)

	ctx := context.Background()
	app.startup(ctx)

	if manager.StartCalls != 1 {
		t.Fatalf("expected tray start once, got %d", manager.StartCalls)
	}
	if len(manager.StartConfig.Icon) == 0 {
		t.Fatal("expected tray start config icon bytes")
	}
	if manager.StartConfig.OnOpen == nil {
		t.Fatal("expected tray start config OnOpen callback")
	}
	if manager.StartConfig.OnExit == nil {
		t.Fatal("expected tray start config OnExit callback")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
	if app.trayManager != manager {
		t.Fatal("expected app to retain tray manager instance")
	}
	if app.hideWindowCalls != 1 {
		t.Fatalf("expected startup to hide window once, got %d", app.hideWindowCalls)
	}
	if app.lastHiddenContext != ctx {
		t.Fatal("expected hide window to receive app context")
	}
}

func TestAppShutdownStopsTrayManager(t *testing.T) {
	t.Parallel()

	manager := &tray.MockTrayManager{}
	app := &App{trayManager: manager}

	app.shutdown(context.Background())

	if manager.StopCalls != 1 {
		t.Fatalf("expected tray stop once, got %d", manager.StopCalls)
	}
}

func TestAppTrayOnOpenShowsAndUnminimisesWindow(t *testing.T) {
	t.Parallel()

	manager := &tray.MockTrayManager{}
	app := newTrayLifecycleTestApp(t, manager)

	app.startup(context.Background())
	manager.StartConfig.OnOpen()

	if app.unminimiseWindowCalls != 1 {
		t.Fatalf("expected OnOpen to unminimise window once, got %d", app.unminimiseWindowCalls)
	}
	if app.showWindowCalls != 1 {
		t.Fatalf("expected OnOpen to show window once, got %d", app.showWindowCalls)
	}
	if app.quitCalls != 0 {
		t.Fatalf("expected OnOpen not to quit app, got %d quit calls", app.quitCalls)
	}
}

func TestAppTrayOnExitRequestsQuit(t *testing.T) {
	t.Parallel()

	manager := &tray.MockTrayManager{}
	app := newTrayLifecycleTestApp(t, manager)

	app.startup(context.Background())
	manager.StartConfig.OnExit()

	if app.quitCalls != 1 {
		t.Fatalf("expected OnExit to request quit once, got %d", app.quitCalls)
	}
	if app.showWindowCalls != 0 {
		t.Fatalf("expected OnExit not to show window, got %d show calls", app.showWindowCalls)
	}
}

func TestAppShutdownWaitsForRuntimeWatcher(t *testing.T) {
	t.Parallel()

	runtimeWatcher := &stubAppRuntimeWatcher{}
	app := &App{animeRuntimeWatcher: runtimeWatcher}

	app.shutdown(context.Background())

	if !runtimeWatcher.waitCalled {
		t.Fatal("expected shutdown to wait for runtime watcher")
	}
}

func TestAppShutdownWaitsForUpdateWriter(t *testing.T) {
	t.Parallel()

	updateWriter := &stubAppUpdateWriter{}
	app := &App{animeUpdateWriter: updateWriter}

	app.shutdown(context.Background())

	if !updateWriter.waitCalled {
		t.Fatal("expected shutdown to wait for update writer")
	}
}

func TestAppShutdownStopsChangelogRecorder(t *testing.T) {
	t.Parallel()

	recorder := &stubAppChangelogRecorder{}
	app := &App{syncChangelogRecorder: recorder}

	app.shutdown(context.Background())

	if !recorder.stopped {
		t.Fatal("expected shutdown to stop changelog recorder")
	}
}

func TestAppShutdownCancelsAnimeCatchUp(t *testing.T) {
	t.Parallel()

	coordinator := &stubAppCoordinator{started: make(chan context.Context, 1)}
	app := &App{animeStartupCoordinator: coordinator}
	ctx, cancel := context.WithCancel(context.Background())
	app.catchUpContext = ctx
	app.catchUpCancel = cancel

	app.shutdown(ctx)

	if !coordinator.waitCalled {
		t.Fatal("expected shutdown to wait for anime startup coordinator")
	}
	if app.catchUpContext == nil || !errors.Is(app.catchUpContext.Err(), context.Canceled) {
		t.Fatalf("expected catch-up context to be canceled, got %v", app.catchUpContext)
	}
}

func TestAppStartupStartsHTTPServerWhenConfigured(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(api.Config) api.Server { return server }

	app.startup(context.Background())

	if !server.started {
		t.Fatal("expected startup to start http server")
	}
}

func TestAppStartupWiresStatusAndConflictServicesIntoHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.Status == nil {
			t.Fatal("expected startup to wire status service into http server config")
		}
		if config.Conflicts == nil {
			t.Fatal("expected startup to wire conflict service into http server config")
		}
		return server
	}

	app.startup(context.Background())

	if !server.started {
		t.Fatal("expected startup to start http server")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupWiresPairingTokenConsumedCallbackIntoHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	emittedEvents := []string{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.OnPairingTokenConsumed == nil {
			t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
		}
		config.OnPairingTokenConsumed()
		return server
	}
	app.emitFn = func(_ context.Context, eventName string, _ ...interface{}) {
		emittedEvents = append(emittedEvents, eventName)
	}

	app.startup(context.Background())

	if !containsString(emittedEvents, pairingTokenConsumedEventName) {
		t.Fatalf("expected bare event %q to be emitted, got %#v", pairingTokenConsumedEventName, emittedEvents)
	}
}

func TestAppStartupPairingTokenConsumedCallbackEmitsSuccessNotificationBesideBareEvent(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	emittedEvents := []string{}
	fakeNotifier := &recordingAppNotifier{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.OnPairingTokenConsumed == nil {
			t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
		}
		config.OnPairingTokenConsumed()
		return server
	}
	app.newNotifier = func(func(context.Context, string, ...interface{}), ...sharedlogger.Logger) notification.Notifier {
		return fakeNotifier
	}
	app.emitFn = func(_ context.Context, eventName string, _ ...interface{}) {
		emittedEvents = append(emittedEvents, eventName)
	}

	app.startup(context.Background())

	if emittedEvents[len(emittedEvents)-1] != pairingTokenConsumedEventName {
		t.Fatalf("expected bare event %q still emitted, got %#v", pairingTokenConsumedEventName, emittedEvents)
	}
	if got := len(fakeNotifier.received); got != 1 {
		t.Fatalf("expected exactly 1 notification delivered, got %d: %#v", got, fakeNotifier.received)
	}
	n := fakeNotifier.received[0]
	if n.Source != "device" {
		t.Fatalf("expected Source %q, got %q", "device", n.Source)
	}
	if n.Level != notification.LevelSuccess {
		t.Fatalf("expected Level %q, got %q", notification.LevelSuccess, n.Level)
	}
	if n.CorrelationID != "" {
		t.Fatalf("expected empty CorrelationID, got %q", n.CorrelationID)
	}
	if n.Timestamp.IsZero() {
		t.Fatal("expected a non-zero Timestamp on the device pairing notification")
	}
}

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

func TestAppStartupPairingTokenConsumedCallbackSurvivesNotifierError(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	emittedEvents := []string{}
	erroringNotifier := &erroringAppNotifier{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.OnPairingTokenConsumed == nil {
			t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
		}
		config.OnPairingTokenConsumed()
		return server
	}
	app.newNotifier = func(func(context.Context, string, ...interface{}), ...sharedlogger.Logger) notification.Notifier {
		return erroringNotifier
	}
	app.emitFn = func(_ context.Context, eventName string, _ ...interface{}) {
		emittedEvents = append(emittedEvents, eventName)
	}

	app.startup(context.Background())

	if emittedEvents[len(emittedEvents)-1] != pairingTokenConsumedEventName {
		t.Fatalf("expected bare event still emitted despite Notify error, got %#v", emittedEvents)
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupPairingTokenConsumedCallbackIsSafeWithNilNotifier(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	emittedEvents := []string{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.OnPairingTokenConsumed == nil {
			t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
		}
		config.OnPairingTokenConsumed()
		return server
	}
	app.newNotifier = func(func(context.Context, string, ...interface{}), ...sharedlogger.Logger) notification.Notifier {
		return nil
	}
	app.emitFn = func(_ context.Context, eventName string, _ ...interface{}) {
		emittedEvents = append(emittedEvents, eventName)
	}

	app.startup(context.Background())

	if emittedEvents[len(emittedEvents)-1] != pairingTokenConsumedEventName {
		t.Fatalf("expected bare event still emitted with nil notifier, got %#v", emittedEvents)
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
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
