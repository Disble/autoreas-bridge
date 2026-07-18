package main

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
)

func TestAppStartupBootstrapsSQLite(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	called := false
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		called = true
		return wantDB, nil
	}

	ctx := context.Background()
	app.startup(ctx)

	if !called {
		t.Fatal("expected startup to invoke sqlite bootstrap")
	}
	if app.ctx != ctx {
		t.Fatal("expected startup to retain context")
	}
	if app.bridgeDB != wantDB {
		t.Fatal("expected startup to store bootstrapped db handle")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupStoresSQLiteBootstrapError(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("sqlite bootstrap failed")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return nil, wantErr }

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("expected startupErr %v, got %v", wantErr, app.startupErr)
	}
	if app.bridgeDB != nil {
		t.Fatal("expected no db handle when bootstrap fails")
	}
}

func TestAppStartupInitializesDownloadStoreBeforeHTTPServerFailure(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("http server failed")
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		return bridgeSync.OpenBridgeDB(dbPath)
	}
	app.newDownloadStore = nil
	app.newHTTPServer = func(api.Config) api.Server {
		return &stubAppHTTPServer{startErr: wantErr}
	}
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("expected startupErr %v, got %v", wantErr, app.startupErr)
	}
	got := app.SetScheduleConfig(contracts.ScheduleConfig{
		Mode:            "in_process",
		DailyTimeHHMM:   "09:00",
		Enabled:         true,
		EnabledWeekdays: 127,
	})
	if got != "ok" {
		t.Fatalf("expected schedule config to persist through the initialized download store, got %q", got)
	}
}

func TestAppStartupLaunchesAnimeCatchUpAsyncAfterSQLiteBootstrap(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	started := make(chan context.Context, 1)
	coordinator := &stubAppCoordinator{started: started}
	app := newAppTestApp(t)
	configureStartupRuntimeDependencies(t, app, wantDB, coordinator)

	ctx := context.Background()
	app.startup(ctx)

	select {
	case gotCtx := <-started:
		if gotCtx == nil {
			t.Fatal("expected catch-up to receive a context")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected startup to launch anime catch-up asynchronously")
	}
	if app.bridgeDB != wantDB {
		t.Fatal("expected sqlite db handle to be retained")
	}
	if app.animeStartupCoordinator != coordinator {
		t.Fatal("expected app to retain startup coordinator")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupNewNotifierOverrideSeamInjectsFakeNotifier(t *testing.T) {
	t.Parallel()

	fake := &stubAppNotifier{}
	var receivedEmit func(ctx context.Context, eventName string, optionalData ...interface{})
	var receivedLoggers []sharedlogger.Logger
	app := newAppTestApp(t)
	app.newNotifier = func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
		receivedEmit = emit
		receivedLoggers = loggers
		return fake
	}

	app.startup(context.Background())

	if app.notifier != fake {
		t.Fatal("expected startup to wire the newNotifier override's returned fake into app.notifier")
	}
	if receivedEmit == nil {
		t.Fatal("expected newNotifier to receive a non-nil emit function")
	}
	if receivedLoggers == nil {
		t.Fatal("expected newNotifier to receive the shared loggers")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupDefaultsNewNotifierWhenOverrideAbsent(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.startup(context.Background())

	if app.notifier == nil {
		t.Fatal("expected startup to default-construct a notifier when no override is provided")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestDefaultNotifierRegistersLogForwardAdapterWhenLoggerIsNonNil(t *testing.T) {
	t.Parallel()

	logger := &recordingSharedAppLogger{}
	notifier := defaultNotifier(func(context.Context, string, ...interface{}) {}, logger)

	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})

	if got := len(logger.entries); got != 1 {
		t.Fatalf("expected the log-forward adapter to write exactly 1 log entry, got %d", got)
	}
}

func TestDefaultNotifierDoesNotRegisterLogForwardAdapterWhenLoggerIsNil(t *testing.T) {
	t.Parallel()

	notifier := defaultNotifier(func(context.Context, string, ...interface{}) {})
	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})
}

func TestDefaultNotifierDoesNotRegisterLogForwardAdapterWhenLoggerArgIsNilValue(t *testing.T) {
	t.Parallel()

	var nilLogger sharedlogger.Logger
	notifier := defaultNotifier(func(context.Context, string, ...interface{}) {}, nilLogger)
	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})
}

func TestAppStartupThreadsNotifierIntoRuntimeWatcherConfig(t *testing.T) {
	t.Parallel()

	fakeNotifier := &stubAppNotifier{}
	var receivedConfig anime.RuntimeWatcherConfig
	app := newAppTestApp(t)
	app.newNotifier = func(func(context.Context, string, ...interface{}), ...sharedlogger.Logger) notification.Notifier {
		return fakeNotifier
	}
	app.newRuntimeWatcher = func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
		receivedConfig = config
		return &stubAppRuntimeWatcher{}
	}

	app.startup(context.Background())

	if receivedConfig.Notifier != fakeNotifier {
		t.Fatalf("expected the watcher factory to receive a.notifier as RuntimeWatcherConfig.Notifier, got %#v", receivedConfig.Notifier)
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupStartsTracerBulletWithSharedEventBus(t *testing.T) {
	t.Parallel()

	var receivedBus events.Bus
	var receivedSink tracerbullet.TraceSink
	runner := &stubTracerBulletRunner{}
	runtimeWatcher := &stubAppRuntimeWatcher{}
	updateWriter := &stubAppUpdateWriter{}
	recorder := &stubAppChangelogRecorder{}
	app := newAppTestApp(t)
	app.newRuntimeWatcher = func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return runtimeWatcher }
	app.newUpdateWriter = func(anime.UpdateWriterConfig) anime.UpdateWriter { return updateWriter }
	app.newChangelogRecorder = func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
		return recorder
	}
	app.newTracerBulletSink = func() tracerbullet.TraceSink { return &stubTraceSink{} }
	app.newTracerBulletRunner = func(bus events.Bus, sink tracerbullet.TraceSink, _ ...sharedlogger.Logger) tracerBulletRunner {
		receivedBus = bus
		receivedSink = sink
		return runner
	}

	app.startup(context.Background())

	if receivedBus == nil {
		t.Fatal("expected startup to create tracer bullet with shared event bus")
	}
	if receivedSink == nil {
		t.Fatal("expected startup to create tracer bullet sink")
	}
	if !runner.started {
		t.Fatal("expected startup to start tracer bullet runner")
	}
	if app.tracerBulletRunner != runner {
		t.Fatal("expected app to retain tracer bullet runner")
	}
	if !runtimeWatcher.started {
		t.Fatal("expected startup to start runtime watcher")
	}
	if !updateWriter.started {
		t.Fatal("expected startup to start update writer")
	}
	if !recorder.started {
		t.Fatal("expected startup to start changelog recorder")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppGetRecentLogsReturnsEmptyWithoutMemLogger(t *testing.T) {
	t.Parallel()

	app := &App{}
	if got := app.GetRecentLogs(); len(got) != 0 {
		t.Fatalf("expected empty recent logs, got %#v", got)
	}
}

func TestAppGetRecentLogsReturnsMemLoggerEntries(t *testing.T) {
	t.Parallel()

	mem := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{Capacity: 2})
	mem.Infof("anime", "booted")
	app := &App{memLogger: mem}

	got := app.GetRecentLogs()
	if len(got) != 1 || got[0].Domain != "anime" || got[0].Message != "booted" {
		t.Fatalf("unexpected recent logs: %#v", got)
	}
}

func TestAppStartupEmitsObservabilityEventOnNewLogEntry(t *testing.T) {
	t.Parallel()

	var emittedName string
	var emittedData any
	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newHTTPServer = func(api.Config) api.Server { return server }
	app.emitFn = func(_ context.Context, eventName string, optionalData ...interface{}) {
		emittedName = eventName
		if len(optionalData) > 0 {
			emittedData = optionalData[0]
		}
	}

	app.startup(context.Background())
	app.sharedLogger.Infof("system", "hello logs")

	if emittedName != observabilityEventName {
		t.Fatalf("expected event %q, got %q", observabilityEventName, emittedName)
	}
	entry, ok := emittedData.(sharedlogger.LogEntry)
	if !ok || entry.Domain != "system" || entry.Message != "hello logs" {
		t.Fatalf("unexpected emitted payload: %#v", emittedData)
	}
}

func TestAppStartupSubscribesRealtimeHubToAnimeChangedEvents(t *testing.T) {
	t.Parallel()

	realtimeHub := &stubAppRealtimeHub{received: make(chan events.AnimeChangedEvent, 1)}
	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newRealtimeHub = func(context.Context) realtime.Hub { return realtimeHub }
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.RealtimeHub != realtimeHub {
			t.Fatal("expected realtime hub to be passed into http server config")
		}
		return server
	}

	app.startup(context.Background())
	app.eventBus.Publish(events.AnimeChangedEvent{AnimeID: "anime-1", Payload: []byte(`{"nombre":"Bleach"}`)})

	select {
	case event := <-realtimeHub.received:
		if event.AnimeID != "anime-1" {
			t.Fatalf("expected anime id %q, got %q", "anime-1", event.AnimeID)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected anime changed event to be forwarded to realtime hub")
	}
}
