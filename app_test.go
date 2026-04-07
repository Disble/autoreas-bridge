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
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/tracerbullet"
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

	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
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

type stubAppCoordinator struct {
	started    chan context.Context
	waitCalled bool
}

type stubTracerBulletRunner struct {
	started bool
}

type stubAppRuntimeWatcher struct {
	started    bool
	waitCalled bool
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
