package main

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/schedule"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
	"autoreas-bridge/internal/tray"
)

func TestAppStartupBootstrapsSQLite(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	called := false
	app := &App{
		bootstrapBridgeDB: func() (*sql.DB, error) {
			called = true
			return wantDB, nil
		},
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
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
	app := &App{
		bootstrapBridgeDB: func() (*sql.DB, error) {
			return nil, wantErr
		},
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
	}

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("expected startupErr %v, got %v", wantErr, app.startupErr)
	}

	if app.bridgeDB != nil {
		t.Fatal("expected no db handle when bootstrap fails")
	}
}

func TestAppStartupLaunchesAnimeCatchUpAsyncAfterSQLiteBootstrap(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	started := make(chan context.Context, 1)
	coordinator := &stubAppCoordinator{started: started}
	app := &App{
		bootstrapBridgeDB: func() (*sql.DB, error) { return wantDB, nil },
		resolveAnimeDataPath: func() (string, error) {
			return filepath.Join("C:\\Users\\User\\AppData\\Roaming\\Autoreas\\data", "animes.dat"), nil
		},
		newSnapshotParser: func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:  func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(config anime.StartupCoordinatorConfig) anime.StartupCoordinator {
			if config.FilePath == "" {
				t.Fatal("expected startup coordinator config to include anime data path")
			}
			return coordinator
		},
		newRuntimeWatcher: func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
			if config.FilePath == "" {
				t.Fatal("expected runtime watcher config to include anime data path")
			}
			return &stubAppRuntimeWatcher{}
		},
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter: func(config anime.UpdateWriterConfig) anime.UpdateWriter {
			if config.FilePath == "" {
				t.Fatal("expected update writer config to include anime data path")
			}
			if config.Bus == nil {
				t.Fatal("expected update writer config to include event bus")
			}
			return &stubAppUpdateWriter{}
		},
		newChangelogStore: func(db *sql.DB) changelogPendingStore {
			if db == nil {
				t.Fatal("expected changelog store to receive sqlite db")
			}
			return &stubAppChangelogStore{}
		},
		newChangelogRecorder: func(bus events.Bus, store changelogPendingStore, _ ...sharedlogger.Logger) changelogRecorder {
			if bus == nil {
				t.Fatal("expected changelog recorder to receive event bus")
			}
			if store == nil {
				t.Fatal("expected changelog recorder to receive changelog store")
			}
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
	}

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

	wantDB := &sql.DB{}
	fake := &stubAppNotifier{}
	var receivedEmit func(ctx context.Context, eventName string, optionalData ...interface{})
	var receivedLoggers []sharedlogger.Logger

	app := &App{
		bootstrapBridgeDB:    func() (*sql.DB, error) { return wantDB, nil },
		resolveAnimeDataPath: func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:    func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:     func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
			return &stubAppCoordinator{}
		},
		newRuntimeWatcher:   func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter:     func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:   func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newNotifier: func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
			receivedEmit = emit
			receivedLoggers = loggers
			return fake
		},
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

	wantDB := &sql.DB{}
	app := &App{
		bootstrapBridgeDB:    func() (*sql.DB, error) { return wantDB, nil },
		resolveAnimeDataPath: func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:    func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:     func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
			return &stubAppCoordinator{}
		},
		newRuntimeWatcher:   func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter:     func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:   func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
	}

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

	// Notify's aggregate error is ignored here -- the desktop-toast adapter
	// can fail in a headless test environment (e.g. no CoInitialize), which
	// is unrelated to the log-forward wiring under test; Dispatcher already
	// isolates that failure from the other adapters (design.md §1).
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

	// Must not panic when Notify is invoked with zero loggers; this exercises
	// the nil-logger guard in defaultNotifier (no log-forward adapter
	// registered, so there is nothing to assert on a logger -- the absence
	// of a panic and of a logger dependency is the assertion).
	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})
}

func TestDefaultNotifierDoesNotRegisterLogForwardAdapterWhenLoggerArgIsNilValue(t *testing.T) {
	t.Parallel()

	var nilLogger sharedlogger.Logger
	notifier := defaultNotifier(func(context.Context, string, ...interface{}) {}, nilLogger)

	// Must not panic when Notify is invoked; the nil logger guard in
	// defaultNotifier means the log-forward adapter is never registered.
	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})
}

func TestAppStartupThreadsNotifierIntoRuntimeWatcherConfig(t *testing.T) {
	t.Parallel()

	fakeNotifier := &stubAppNotifier{}
	var receivedConfig anime.RuntimeWatcherConfig
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher: func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
			receivedConfig = config
			return &stubAppRuntimeWatcher{}
		},
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter:     func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:   func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newNotifier: func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
			return fakeNotifier
		},
	}

	app.startup(context.Background())

	if receivedConfig.Notifier != fakeNotifier {
		t.Fatalf("expected the watcher factory to receive a.notifier as RuntimeWatcherConfig.Notifier, got %#v", receivedConfig.Notifier)
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

// recordingSharedAppLogger is a minimal sharedlogger.Logger test double used
// to assert defaultNotifier wires the log-forward adapter into the
// Dispatcher when a non-nil logger is supplied.
type recordingSharedAppLogger struct {
	entries []string
}

func (l *recordingSharedAppLogger) Debugf(domain, format string, args ...any) {}
func (l *recordingSharedAppLogger) Infof(domain, format string, args ...any) {
	l.entries = append(l.entries, format)
}
func (l *recordingSharedAppLogger) Warnf(domain, format string, args ...any)  {}
func (l *recordingSharedAppLogger) Errorf(domain, format string, args ...any) {}
func (l *recordingSharedAppLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entries = append(l.entries, format)
}

func TestAppStartupStartsTracerBulletWithSharedEventBus(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	var receivedBus events.Bus
	var receivedSink tracerbullet.TraceSink
	runner := &stubTracerBulletRunner{}
	runtimeWatcher := &stubAppRuntimeWatcher{}
	updateWriter := &stubAppUpdateWriter{}
	recorder := &stubAppChangelogRecorder{}
	app := &App{
		bootstrapBridgeDB:    func() (*sql.DB, error) { return wantDB, nil },
		resolveAnimeDataPath: func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:    func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:     func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
			return &stubAppCoordinator{started: make(chan context.Context, 1)}
		},
		newRuntimeWatcher: func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
			return runtimeWatcher
		},
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter: func(anime.UpdateWriterConfig) anime.UpdateWriter {
			return updateWriter
		},
		newChangelogStore: func(*sql.DB) changelogPendingStore {
			return &stubAppChangelogStore{}
		},
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return recorder
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newTracerBulletSink: func() tracerbullet.TraceSink {
			return &stubTraceSink{}
		},
		newTracerBulletRunner: func(bus events.Bus, sink tracerbullet.TraceSink, _ ...sharedlogger.Logger) tracerBulletRunner {
			receivedBus = bus
			receivedSink = sink
			return runner
		},
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

	if app.bridgeDB != wantDB {
		t.Fatal("expected startup to continue bootstrapping sqlite after tracer bullet wiring")
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
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return server },
		emitFn: func(_ context.Context, eventName string, optionalData ...interface{}) {
			emittedName = eventName
			if len(optionalData) > 0 {
				emittedData = optionalData[0]
			}
		},
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

	ctx := context.Background()
	app.startup(ctx)
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

	ctx := context.Background()
	app.startup(ctx)
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
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer: func(api.Config) api.Server {
			return server
		},
	}

	app.startup(context.Background())

	if !server.started {
		t.Fatal("expected startup to start http server")
	}
}

func TestAppStartupWiresStatusAndConflictServicesIntoHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer: func(config api.Config) api.Server {
			if config.Status == nil {
				t.Fatal("expected startup to wire status service into http server config")
			}
			if config.Conflicts == nil {
				t.Fatal("expected startup to wire conflict service into http server config")
			}
			return server
		},
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
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer: func(config api.Config) api.Server {
			if config.OnPairingTokenConsumed == nil {
				t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
			}
			config.OnPairingTokenConsumed()
			return server
		},
		emitFn: func(_ context.Context, eventName string, _ ...interface{}) {
			emittedEvents = append(emittedEvents, eventName)
		},
	}

	app.startup(context.Background())

	found := false
	for _, eventName := range emittedEvents {
		if eventName == pairingTokenConsumedEventName {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected bare event %q to be emitted, got %#v", pairingTokenConsumedEventName, emittedEvents)
	}
}

func TestAppStartupPairingTokenConsumedCallbackEmitsSuccessNotificationBesideBareEvent(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	emittedEvents := []string{}
	fakeNotifier := &recordingAppNotifier{}
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer: func(config api.Config) api.Server {
			if config.OnPairingTokenConsumed == nil {
				t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
			}
			config.OnPairingTokenConsumed()
			return server
		},
		newNotifier: func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
			return fakeNotifier
		},
		emitFn: func(_ context.Context, eventName string, _ ...interface{}) {
			emittedEvents = append(emittedEvents, eventName)
		},
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
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer: func(config api.Config) api.Server {
			if config.OnPairingTokenConsumed == nil {
				t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
			}
			config.OnPairingTokenConsumed()
			return server
		},
		newNotifier: func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
			return erroringNotifier
		},
		emitFn: func(_ context.Context, eventName string, _ ...interface{}) {
			emittedEvents = append(emittedEvents, eventName)
		},
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
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer: func(config api.Config) api.Server {
			if config.OnPairingTokenConsumed == nil {
				t.Fatal("expected startup to wire pairing-token-consumed callback into http server config")
			}
			config.OnPairingTokenConsumed()
			return server
		},
		newNotifier: func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
			return nil
		},
		emitFn: func(_ context.Context, eventName string, _ ...interface{}) {
			emittedEvents = append(emittedEvents, eventName)
		},
	}

	app.startup(context.Background())

	if emittedEvents[len(emittedEvents)-1] != pairingTokenConsumedEventName {
		t.Fatalf("expected bare event still emitted with nil notifier, got %#v", emittedEvents)
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupSubscribesRealtimeHubToAnimeChangedEvents(t *testing.T) {
	t.Parallel()

	realtimeHub := &stubAppRealtimeHub{received: make(chan events.AnimeChangedEvent, 1)}
	server := &stubAppHTTPServer{}
	app := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newRealtimeHub:   func(context.Context) realtime.Hub { return realtimeHub },
		newHTTPServer: func(config api.Config) api.Server {
			if config.RealtimeHub != realtimeHub {
				t.Fatal("expected realtime hub to be passed into http server config")
			}
			return server
		},
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

func TestAppShutdownStopsHTTPServer(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := &App{httpServer: server}

	app.shutdown(context.Background())

	if !server.stopped {
		t.Fatal("expected shutdown to stop http server")
	}
}

type stubAppCoordinator struct {
	started    chan context.Context
	waitCalled bool
}

type trayLifecycleTestApp struct {
	*App
	hideWindowCalls       int
	showWindowCalls       int
	unminimiseWindowCalls int
	quitCalls             int
	lastHiddenContext     context.Context
}

func newTrayLifecycleTestApp(t *testing.T, manager *tray.MockTrayManager) *trayLifecycleTestApp {
	t.Helper()

	base := &App{
		bootstrapBridgeDB:     func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath:  func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:     func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:      func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator { return &stubAppCoordinator{} },
		newRuntimeWatcher:     func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry:   anime.NewSelfEchoRegistry,
		newUpdateWriter:       func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:     func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newTrayManager:   func() tray.TrayManager { return manager },
	}

	app := &trayLifecycleTestApp{App: base}
	base.hideWindow = func(ctx context.Context) {
		app.hideWindowCalls++
		app.lastHiddenContext = ctx
	}
	base.showWindow = func(context.Context) {
		app.showWindowCalls++
	}
	base.unminimiseWindow = func(context.Context) {
		app.unminimiseWindowCalls++
	}
	base.quitApp = func(context.Context) {
		app.quitCalls++
	}

	return app
}

type stubTracerBulletRunner struct {
	started bool
}

type stubAppRuntimeWatcher struct {
	started    bool
	waitCalled bool
}

type stubAppUpdateWriter struct {
	started    bool
	waitCalled bool
}

type stubAppChangelogStore struct{}

type stubAppDeviceStore struct{}

type stubAppHTTPServer struct {
	started bool
	stopped bool
}

type stubAppRealtimeHub struct {
	received chan events.AnimeChangedEvent
}

type stubAppDeviceService struct{}

type stubAppNotifier struct{}

func (*stubAppNotifier) Notify(context.Context, notification.Notification) error {
	return nil
}

// recordingAppNotifier records every delivered Notification so app-level
// producer seams (e.g. the pairing-token-consumed callback) can be asserted
// without depending on the real Dispatcher fan-out.
type recordingAppNotifier struct {
	received []notification.Notification
}

func (n *recordingAppNotifier) Notify(_ context.Context, notif notification.Notification) error {
	n.received = append(n.received, notif)
	return nil
}

// erroringAppNotifier always fails Notify, proving producer call sites
// treat a Notify error as non-fatal to their own feature logic.
type erroringAppNotifier struct{}

func (*erroringAppNotifier) Notify(context.Context, notification.Notification) error {
	return errors.New("notify boom")
}

func (*stubAppChangelogStore) InsertPending(context.Context, bridgeSync.ChangelogEntry) error {
	return nil
}

func (*stubAppDeviceStore) SavePairingToken(context.Context, string, int64) error {
	return nil
}

func (*stubAppDeviceStore) ConsumePairingToken(context.Context, string, int64) error {
	return nil
}

func (*stubAppDeviceStore) InsertPairedDevice(context.Context, device.StoredDevice) error {
	return nil
}

func (*stubAppDeviceStore) FindByAuthToken(context.Context, string) (device.StoredDevice, error) {
	return device.StoredDevice{}, nil
}

func (*stubAppDeviceStore) ListPairedDevices(context.Context) ([]device.StoredDevice, error) {
	return nil, nil
}

func (*stubAppDeviceStore) DeletePairedDevice(context.Context, string) error {
	return nil
}

func (stubAppDeviceService) PairDevice(context.Context, device.PairDeviceRequest) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
}

func (stubAppDeviceService) AuthenticateToken(context.Context, string) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
}

func (stubAppDeviceService) ListDevices(context.Context) ([]contracts.DeviceInfo, error) {
	return nil, nil
}

func (stubAppDeviceService) RevokeDevice(context.Context, string) error {
	return nil
}

func (s *stubAppHTTPServer) Start() error {
	s.started = true
	return nil
}

func (s *stubAppHTTPServer) Shutdown(context.Context) error {
	s.stopped = true
	return nil
}

func (*stubAppHTTPServer) Addr() string {
	return "127.0.0.1:0"
}

func (*stubAppHTTPServer) EffectiveAddress() string {
	return "192.168.1.50:8080"
}

func (s *stubAppRealtimeHub) Register(context.Context, realtime.Client) error {
	return nil
}

func (s *stubAppRealtimeHub) Unregister(string) {}

func (s *stubAppRealtimeHub) BroadcastAnimeChanged(_ context.Context, event events.AnimeChangedEvent) {
	s.received <- event
}

func (*stubAppRealtimeHub) Close() error {
	return nil
}

type stubAppChangelogRecorder struct {
	started bool
	stopped bool
}

func (s *stubAppRuntimeWatcher) StartAsync(context.Context) {
	s.started = true
}

func (s *stubAppRuntimeWatcher) Wait() {
	s.waitCalled = true
}

func (s *stubAppRuntimeWatcher) Err() error {
	return nil
}

func (s *stubAppUpdateWriter) StartAsync(context.Context) {
	s.started = true
}

func (s *stubAppUpdateWriter) Wait() {
	s.waitCalled = true
}

func (s *stubAppUpdateWriter) Err() error {
	return nil
}

func (s *stubAppUpdateWriter) RequestWrite(context.Context, string, []byte) error {
	return nil
}

func (s *stubAppChangelogRecorder) Start(context.Context) {
	s.started = true
}

func (s *stubAppChangelogRecorder) Stop() {
	s.stopped = true
}

func (s *stubAppChangelogRecorder) Err() error {
	return nil
}

func (s *stubTracerBulletRunner) Start() {
	s.started = true
}

type stubTraceSink struct{}

func (*stubTraceSink) Record(string) {}

func (s *stubAppCoordinator) StartAsync(ctx context.Context) {
	if s.started != nil {
		s.started <- ctx
	}
}

func (s *stubAppCoordinator) Wait() {
	s.waitCalled = true
}

func (s *stubAppCoordinator) Err() error {
	return nil
}

func (s *stubAppCoordinator) ContextErr() error {
	return nil
}

type stubAppParser struct{}

func (stubAppParser) Parse(io.Reader) (map[string]anime.SnapshotRecord, []anime.ParseWarning, error) {
	return nil, nil, nil
}

type stubAppStore struct{}

func (stubAppStore) ListSnapshots(context.Context) (map[string]anime.SnapshotRecord, error) {
	return nil, nil
}

func (stubAppStore) ReplaceBaseline(context.Context, map[string]anime.SnapshotRecord, []string) error {
	return nil
}

// ── GetBridgeStatus ──────────────────────────────────────────────────────────

func TestGetBridgeStatusReturnsOkWhenNoStartupError(t *testing.T) {
	t.Parallel()
	app := &App{}
	if got := app.GetBridgeStatus(); got != "ok" {
		t.Fatalf("expected %q, got %q", "ok", got)
	}
}

func TestGetBridgeStatusReturnsErrorStringWhenStartupFailed(t *testing.T) {
	t.Parallel()
	app := &App{startupErr: errors.New("sqlite failed")}
	got := app.GetBridgeStatus()
	if got == "ok" {
		t.Fatal("expected non-ok status when startupErr is set")
	}
	if got != "sqlite failed" {
		t.Fatalf("expected error string %q, got %q", "sqlite failed", got)
	}
}

// ── GetEffectiveAddress ──────────────────────────────────────────────────────

func TestGetEffectiveAddressReturnsEmptyWhenHTTPServerNil(t *testing.T) {
	t.Parallel()
	app := &App{}
	if got := app.GetEffectiveAddress(); got != "" {
		t.Fatalf("expected empty string when httpServer nil, got %q", got)
	}
}

func TestGetEffectiveAddressReturnsDelegatedAddress(t *testing.T) {
	t.Parallel()
	app := &App{httpServer: &stubAppHTTPServer{}}
	got := app.GetEffectiveAddress()
	if got != "192.168.1.50:8080" {
		t.Fatalf("expected %q, got %q", "192.168.1.50:8080", got)
	}
}

// ── TriggerReconcile ─────────────────────────────────────────────────────────

func TestTriggerReconcileReturnsErrorWhenSyncTriggerNil(t *testing.T) {
	t.Parallel()
	app := &App{}
	got := app.TriggerReconcile()
	if got == "ok" {
		t.Fatal("expected error string when syncTrigger is nil")
	}
	if got == "" {
		t.Fatal("expected non-empty error string when syncTrigger is nil")
	}
}

func TestTriggerReconcileReturnsOkWhenSyncTriggerPublishes(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()
	syncTrigger := bridgeSync.NewTriggerService(bus, nil)
	app := &App{syncTrigger: syncTrigger, ctx: context.Background()}
	if got := app.TriggerReconcile(); got != "ok" {
		t.Fatalf("expected %q, got %q", "ok", got)
	}
}

// ── GetSQLiteStatus ──────────────────────────────────────────────────────────

func TestGetSQLiteStatusReturnsErrorWhenBridgeDBNil(t *testing.T) {
	t.Parallel()
	app := &App{}
	got := app.GetSQLiteStatus()
	if got == "ok" {
		t.Fatal("expected non-ok status when bridgeDB is nil")
	}
	if got == "" {
		t.Fatal("expected non-empty error string when bridgeDB is nil")
	}
}

func TestGetSQLiteStatusReturnsOkWhenBridgeDBInitialized(t *testing.T) {
	t.Parallel()
	// Use a real *sql.DB opened against sqlite3 in-memory so Ping succeeds.
	// We cannot ping a bare &sql.DB{} — it panics. Use an in-memory SQLite db.
	db, err := openInMemorySQLite(t)
	if err != nil {
		t.Skipf("sqlite3 unavailable: %v", err)
	}
	app := &App{bridgeDB: db, ctx: context.Background()}
	if got := app.GetSQLiteStatus(); got != "ok" {
		t.Fatalf("expected %q, got %q", "ok", got)
	}
}

// ── GetPairingToken ──────────────────────────────────────────────────────────

func TestGetPairingTokenReturnsErrorWhenDeviceStoreNil(t *testing.T) {
	t.Parallel()
	// deviceStore is nil (not set) — GetPairingToken must degrade gracefully.
	app := &App{ctx: context.Background()}
	got := app.GetPairingToken()
	if got == "" {
		t.Fatal("expected non-empty error string when device store is nil")
	}
	if isHex32(got) {
		t.Fatalf("expected error string, not a 32-char hex token, got %q", got)
	}
}

func TestGetPairingTokenReturns32CharHexAndPersists(t *testing.T) {
	t.Parallel()
	spy := &spyDeviceStore{}
	// Inject deviceStore directly — same pattern used for httpServer, trayManager etc.
	app := &App{ctx: context.Background(), deviceStore: spy}
	got := app.GetPairingToken()
	if !isHex32(got) {
		t.Fatalf("expected 32-char hex token, got %q", got)
	}
	if spy.savedToken != got {
		t.Fatalf("expected token %q to be persisted, spy has %q", got, spy.savedToken)
	}
}

func TestGetSyncingAnimeItemsReturnsEmptyWhenSyncTriggerNil(t *testing.T) {
	t.Parallel()

	app := &App{}

	got := app.GetSyncingAnimeItems()
	if len(got) != 0 {
		t.Fatalf("expected empty syncing anime list, got %#v", got)
	}
}

func TestGetSyncingAnimeItemsDelegatesToSyncTrigger(t *testing.T) {
	t.Parallel()

	current := 12.0
	store := stubPendingLookup{pending: []bridgeSync.ChangelogEntry{{
		ID:            1,
		AnimeID:       "anime-9",
		ChangeType:    bridgeSync.ChangelogTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"_id":"anime-9","nombre":"Frieren","nrocapvisto":12,"activo":true}`),
		ChangedAtMs:   1710000000123,
	}}}
	app := &App{syncTrigger: bridgeSync.NewTriggerService(events.NewBus(), store), ctx: context.Background()}

	got := app.GetSyncingAnimeItems()
	if len(got) != 1 {
		t.Fatalf("expected one syncing anime item, got %#v", got)
	}
	if got[0].AnimeID != "anime-9" || got[0].Title != "Frieren" {
		t.Fatalf("unexpected syncing anime payload: %#v", got[0])
	}
	if got[0].ProgressCurrent == nil || *got[0].ProgressCurrent != current {
		t.Fatalf("expected progress current %v, got %#v", current, got[0].ProgressCurrent)
	}
}

// ── Download bindings (SDD-28 PR4b Phase 6 task 6.11/6.12) ─────────────────────
//
// Every binding below MUST degrade gracefully (never panic) when its backing
// dependency (downloadStore/downloadService/downloadScheduler) is nil --
// mirroring the existing GetPairingToken/GetSyncingAnimeItems/GetAnimes
// nil-degradation convention in this file.

func TestGetDownloadConfigReturnsZeroValueWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.GetDownloadConfig()
	if got.JD.Email != "" || got.Schedule.Enabled || len(got.HosterPriority) != 0 {
		t.Fatalf("expected zero-value DownloadConfig when store is nil, got %#v", got)
	}
}

func TestSetHosterPriorityReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.SetHosterPriority("jkanime", []contracts.HosterPriorityItem{{Hoster: "Mega", Priority: 0, Enabled: true}})
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when store is nil, got %q", got)
	}
}

func TestGetJDStatusReturnsZeroValueWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.GetJDStatus()
	if got.Email != "" || got.HasPassword || got.LastSeenStatus != "" {
		t.Fatalf("expected zero-value JDStatus when store is nil, got %#v", got)
	}
}

func TestSetJDConfigReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.SetJDConfig(contracts.JDConfigInput{Email: "user@example.com"})
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when store is nil, got %q", got)
	}
}

func TestGetScheduleConfigReturnsZeroValueWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.GetScheduleConfig()
	if got.Enabled || got.DailyTimeHHMM != "" {
		t.Fatalf("expected zero-value ScheduleConfig when store is nil, got %#v", got)
	}
}

func TestSetScheduleConfigReturnsErrorStringWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.SetScheduleConfig(contracts.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true})
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when store is nil, got %q", got)
	}
}

func TestTriggerDownloadCheckReturnsErrorStringWhenSchedulerNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.TriggerDownloadCheck()
	if got == "ok" || got == "" {
		t.Fatalf("expected non-ok error string when scheduler is nil, got %q", got)
	}
}

func TestListDownloadRunsReturnsEmptyWhenStoreNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	got := app.ListDownloadRuns()
	if len(got) != 0 {
		t.Fatalf("expected empty run list when store is nil, got %#v", got)
	}
}

func TestGetDownloadConfigDelegatesToStore(t *testing.T) {
	t.Parallel()
	store := &fakeAppDownloadStore{
		jdConfig:       download.JDConfig{Email: "user@example.com", DeviceName: "MyPC"},
		scheduleConfig: download.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true},
		hosterPriority: []download.HosterPriorityEntry{{Hoster: "Mega", Priority: 0, Enabled: true}},
	}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.GetDownloadConfig()
	if got.JD.Email != "user@example.com" || got.JD.DeviceName != "MyPC" {
		t.Fatalf("expected JD config to be delegated, got %#v", got.JD)
	}
	if got.Schedule.DailyTimeHHMM != "09:00" || !got.Schedule.Enabled {
		t.Fatalf("expected schedule config to be delegated, got %#v", got.Schedule)
	}
	if len(got.HosterPriority) != 1 || got.HosterPriority[0].Hoster != "Mega" {
		t.Fatalf("expected hoster priority to be delegated, got %#v", got.HosterPriority)
	}
}

func TestSetHosterPriorityPersistsViaStore(t *testing.T) {
	t.Parallel()
	store := &fakeAppDownloadStore{}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.SetHosterPriority("jkanime", []contracts.HosterPriorityItem{{Hoster: "Mediafire", Priority: 0, Enabled: true}})
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if len(store.setHosterPriorityEntries) != 1 || store.setHosterPriorityEntries[0].Hoster != "Mediafire" {
		t.Fatalf("expected hoster priority to be persisted, got %#v", store.setHosterPriorityEntries)
	}
}

func TestSetJDConfigPersistsViaStore(t *testing.T) {
	t.Parallel()
	store := &fakeAppDownloadStore{}
	app := &App{ctx: context.Background(), downloadStore: store}

	password := "secret"
	got := app.SetJDConfig(contracts.JDConfigInput{Email: "new@example.com", PlaintextPassword: &password})
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if store.setJDConfigCfg.Email != "new@example.com" {
		t.Fatalf("expected email to be persisted, got %#v", store.setJDConfigCfg)
	}
	if store.setJDConfigPassword == nil || *store.setJDConfigPassword != password {
		t.Fatalf("expected password to be forwarded, got %#v", store.setJDConfigPassword)
	}
}

func TestSetScheduleConfigPersistsViaStore(t *testing.T) {
	t.Parallel()
	store := &fakeAppDownloadStore{}
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), downloadStore: store, downloadScheduler: sched}

	got := app.SetScheduleConfig(contracts.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "20:30", Enabled: true})
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if store.setScheduleConfigCfg.DailyTimeHHMM != "20:30" {
		t.Fatalf("expected schedule config to be persisted, got %#v", store.setScheduleConfigCfg)
	}
	if sched.notifyConfigChangedCalls != 1 {
		t.Fatalf("expected scheduler config-change notification once, got %d", sched.notifyConfigChangedCalls)
	}
}

// TestSetScheduleConfigMapsEnabledWeekdaysIntoDomainStore asserts SetScheduleConfig maps
// contracts.ScheduleConfig.EnabledWeekdays (int) into the domain ScheduleConfig.EnabledWeekdays
// (byte) 1:1 (SDD download-schedule-weekdays design "App bindings map the field 1:1 both
// directions"), including the boundary values 0 (empty mask) and 127 (all days).
func TestSetScheduleConfigMapsEnabledWeekdaysIntoDomainStore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   int
		want byte
	}{
		{name: "all days enabled (127)", in: 127, want: 127},
		{name: "empty mask (0)", in: 0, want: 0},
		{name: "arbitrary mask", in: 21, want: 21}, // bits 0,2,4
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeAppDownloadStore{}
			app := &App{ctx: context.Background(), downloadStore: store}

			got := app.SetScheduleConfig(contracts.ScheduleConfig{
				Mode:            "in_process",
				DailyTimeHHMM:   "09:00",
				Enabled:         true,
				EnabledWeekdays: tc.in,
			})
			if got != "ok" {
				t.Fatalf("expected ok, got %q", got)
			}
			if store.setScheduleConfigCfg.EnabledWeekdays != tc.want {
				t.Fatalf("expected domain EnabledWeekdays = %d, got %d", tc.want, store.setScheduleConfigCfg.EnabledWeekdays)
			}
		})
	}
}

// TestGetScheduleConfigMapsEnabledWeekdaysFromDomainStore asserts GetScheduleConfig /
// toContractsScheduleConfig maps the domain ScheduleConfig.EnabledWeekdays (byte) back into the
// contract's int field 1:1, including the boundary values 0 and 127.
func TestGetScheduleConfigMapsEnabledWeekdaysFromDomainStore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   byte
		want int
	}{
		{name: "all days enabled (127)", in: 127, want: 127},
		{name: "empty mask (0)", in: 0, want: 0},
		{name: "arbitrary mask", in: 21, want: 21},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeAppDownloadStore{
				scheduleConfig: download.ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true, EnabledWeekdays: tc.in},
			}
			app := &App{ctx: context.Background(), downloadStore: store}

			got := app.GetScheduleConfig()
			if got.EnabledWeekdays != tc.want {
				t.Fatalf("expected contract EnabledWeekdays = %d, got %d", tc.want, got.EnabledWeekdays)
			}
		})
	}
}

func TestTriggerDownloadCheckDelegatesToScheduler(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	got := app.TriggerDownloadCheck()
	if got != "ok" {
		t.Fatalf("expected ok, got %q", got)
	}
	if sched.triggerNowCalls != 1 {
		t.Fatalf("expected TriggerNow to be called once, got %d", sched.triggerNowCalls)
	}
}

func TestTriggerDownloadCheckSurfacesErrRunInProgress(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{triggerNowErr: schedule.ErrRunInProgress}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	got := app.TriggerDownloadCheck()
	if got != schedule.ErrRunInProgress.Error() {
		t.Fatalf("expected ErrRunInProgress message, got %q", got)
	}
}

func TestListDownloadRunsDelegatesToStore(t *testing.T) {
	t.Parallel()
	finishedAt := int64(1750000001000)
	store := &fakeAppDownloadStore{
		runs: []download.DownloadRun{
			{RunID: "run-1", StartedAtMs: 1750000000000, FinishedAtMs: &finishedAt, Status: "ok", AnimesChecked: 3},
		},
	}
	app := &App{ctx: context.Background(), downloadStore: store}

	got := app.ListDownloadRuns()
	if len(got) != 1 {
		t.Fatalf("expected one run, got %#v", got)
	}
	if got[0].RunID != "run-1" || got[0].Status != "ok" || got[0].AnimesChecked != 3 {
		t.Fatalf("unexpected run view: %#v", got[0])
	}
	if got[0].FinishedAtMs == nil || *got[0].FinishedAtMs != finishedAt {
		t.Fatalf("expected FinishedAtMs to be forwarded, got %#v", got[0].FinishedAtMs)
	}
}

func TestNewJDownloaderClientSuppliesNonNilLogger(t *testing.T) {
	t.Parallel()

	client := newJDownloaderClient("user@example.com", "secret")
	value := reflect.ValueOf(client)
	if value.Kind() != reflect.Ptr || value.IsNil() {
		t.Fatalf("expected concrete pointer client, got %T", client)
	}

	logField := value.Elem().FieldByName("log")
	if !logField.IsValid() {
		t.Fatal("expected jdownloader client to expose internal log field")
	}
	if logField.IsNil() {
		t.Fatal("expected jdownloader client logger to be non-nil")
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

// fakeAppDownloadStore is a minimal in-memory download.DownloadStore fake for app.go binding
// tests -- it implements every method on the interface but only the ones exercised by the
// bindings above carry real behavior; the rest are no-ops returning zero values.
type fakeAppDownloadStore struct {
	jdConfig       download.JDConfig
	scheduleConfig download.ScheduleConfig
	hosterPriority []download.HosterPriorityEntry
	runs           []download.DownloadRun

	setHosterPriorityEntries []download.HosterPriorityEntry
	setJDConfigCfg           download.JDConfig
	setJDConfigPassword      *string
	setScheduleConfigCfg     download.ScheduleConfig
}

func (f *fakeAppDownloadStore) ListHosterPriority(context.Context, string) ([]download.HosterPriorityEntry, error) {
	return f.hosterPriority, nil
}

func (f *fakeAppDownloadStore) SetHosterPriority(_ context.Context, _ string, entries []download.HosterPriorityEntry) error {
	f.setHosterPriorityEntries = entries
	return nil
}

func (f *fakeAppDownloadStore) SeedHosterPriorityIfEmpty(context.Context, string, []download.HosterPriorityEntry) error {
	return nil
}

func (f *fakeAppDownloadStore) GetJDConfig(context.Context) (download.JDConfig, error) {
	return f.jdConfig, nil
}

func (f *fakeAppDownloadStore) SetJDConfig(_ context.Context, cfg download.JDConfig, password *string) error {
	f.setJDConfigCfg = cfg
	f.setJDConfigPassword = password
	return nil
}

func (f *fakeAppDownloadStore) SetJDStatus(context.Context, string, int64) error { return nil }

func (f *fakeAppDownloadStore) DecryptedPassword(context.Context) (string, bool, error) {
	return "", false, nil
}

func (f *fakeAppDownloadStore) GetScheduleConfig(context.Context) (download.ScheduleConfig, error) {
	return f.scheduleConfig, nil
}

func (f *fakeAppDownloadStore) SetScheduleConfig(_ context.Context, cfg download.ScheduleConfig) error {
	f.setScheduleConfigCfg = cfg
	return nil
}

func (f *fakeAppDownloadStore) MarkScheduleRun(context.Context, int64, string, int64) error {
	return nil
}

func (f *fakeAppDownloadStore) OpenRun(context.Context, download.DownloadRun) error { return nil }

func (f *fakeAppDownloadStore) UpdateRunProgress(context.Context, download.DownloadRun) error {
	return nil
}

func (f *fakeAppDownloadStore) FinalizeRun(context.Context, download.DownloadRun) error { return nil }

func (f *fakeAppDownloadStore) ListRuns(context.Context, int) ([]download.DownloadRun, error) {
	return f.runs, nil
}

func (f *fakeAppDownloadStore) ReconcileInterruptedRuns(context.Context, int64) (int, error) {
	return 0, nil
}

var _ download.DownloadStore = (*fakeAppDownloadStore)(nil)

// fakeAppScheduler is a minimal schedule.Scheduler fake for app.go binding tests.
type fakeAppScheduler struct {
	triggerNowCalls          int
	notifyConfigChangedCalls int
	triggerNowErr            error
	status                   schedule.Status
}

func (f *fakeAppScheduler) Start(context.Context) {}

func (f *fakeAppScheduler) Stop() {}

func (f *fakeAppScheduler) NotifyConfigChanged() { f.notifyConfigChangedCalls++ }

func (f *fakeAppScheduler) TriggerNow(context.Context, string) error {
	f.triggerNowCalls++
	return f.triggerNowErr
}

func (f *fakeAppScheduler) Status(context.Context) schedule.Status {
	return f.status
}

var _ schedule.Scheduler = (*fakeAppScheduler)(nil)

type stubPendingLookup struct {
	pending []bridgeSync.ChangelogEntry
}

func (s stubPendingLookup) ListSinceTimestamp(context.Context, int64) ([]bridgeSync.ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListAfterID(context.Context, int64) ([]bridgeSync.ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListPending(context.Context) ([]bridgeSync.ChangelogEntry, error) {
	return append([]bridgeSync.ChangelogEntry(nil), s.pending...), nil
}

func (s stubPendingLookup) LastID(context.Context) (int64, error) {
	return 0, nil
}

func (s stubPendingLookup) LastChangedAt(context.Context) (*int64, error) {
	return nil, nil
}

type spyDeviceStore struct {
	stubAppDeviceStore
	savedToken string
	saveErr    error
}

func (s *spyDeviceStore) SavePairingToken(_ context.Context, token string, _ int64) error {
	s.savedToken = token
	return s.saveErr
}

func isHex32(s string) bool {
	if len(s) != 32 {
		return false
	}
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}

func openInMemorySQLite(t *testing.T) (*sql.DB, error) {
	t.Helper()
	// bridgeSync.BootstrapBridgeDB uses "modernc.org/sqlite" driver registered as "sqlite".
	// Use the same driver name to open an in-memory database.
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, nil
}
