package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api"
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

	app := &App{}
	ctx, cancel := context.WithCancel(context.Background())
	app.catchUpContext = ctx
	app.catchUpCancel = cancel

	app.shutdown(ctx)

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

func TestAppStartupWiresMobileActivityWriterIntoHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(config api.Config) api.Server {
		if _, ok := config.AnimeWrite.(activityAnimeWriteService); !ok {
			t.Fatalf("expected mobile activity writer, got %T", config.AnimeWrite)
		}
		return server
	}

	app.startup(context.Background())

	if !server.started {
		t.Fatal("expected startup to start http server")
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
