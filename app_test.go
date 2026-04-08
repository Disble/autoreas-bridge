package main

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
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
		newChangelogRecorder:  func(events.Bus, changelogPendingStore) changelogRecorder { return &stubAppChangelogRecorder{} },
		newDeviceStore:        func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService:      func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newHTTPServer:         func(api.Config) api.Server { return &stubAppHTTPServer{} },
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
		newChangelogRecorder:  func(events.Bus, changelogPendingStore) changelogRecorder { return &stubAppChangelogRecorder{} },
		newDeviceStore:        func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService:      func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newHTTPServer:         func(api.Config) api.Server { return &stubAppHTTPServer{} },
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
		newChangelogRecorder: func(bus events.Bus, store changelogPendingStore) changelogRecorder {
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
		newChangelogRecorder: func(events.Bus, changelogPendingStore) changelogRecorder {
			return recorder
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newTracerBulletSink: func() tracerbullet.TraceSink {
			return &stubTraceSink{}
		},
		newTracerBulletRunner: func(bus events.Bus, sink tracerbullet.TraceSink) tracerBulletRunner {
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
		newChangelogRecorder:  func(events.Bus, changelogPendingStore) changelogRecorder { return &stubAppChangelogRecorder{} },
		newDeviceStore:        func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService:      func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newHTTPServer: func(api.Config) api.Server {
			return server
		},
	}

	app.startup(context.Background())

	if !server.started {
		t.Fatal("expected startup to start http server")
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
		newChangelogRecorder:  func(events.Bus, changelogPendingStore) changelogRecorder { return &stubAppChangelogRecorder{} },
		newDeviceStore:        func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService:      func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newRealtimeHub:        func(context.Context) realtime.Hub { return realtimeHub },
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
		newChangelogRecorder:  func(events.Bus, changelogPendingStore) changelogRecorder { return &stubAppChangelogRecorder{} },
		newDeviceStore:        func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService:      func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newHTTPServer:         func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newTrayManager:        func() tray.TrayManager { return manager },
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

func (stubAppDeviceService) PairDevice(context.Context, device.PairDeviceRequest) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
}

func (stubAppDeviceService) AuthenticateToken(context.Context, string) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
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
	syncTrigger := bridgeSync.NewTriggerService(bus)
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

// ── helpers ──────────────────────────────────────────────────────────────────

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
