package main

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
)

// App struct
type App struct {
	ctx                     context.Context
	bridgeDB                *sql.DB
	startupErr              error
	bootstrapBridgeDB       func() (*sql.DB, error)
	resolveAnimeDataPath    func() (string, error)
	newSnapshotParser       func() anime.SnapshotParser
	newSnapshotStore        func(db *sql.DB) anime.SnapshotStore
	newStartupCoordinator   func(config anime.StartupCoordinatorConfig) anime.StartupCoordinator
	newRuntimeWatcher       func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher
	newSelfEchoRegistry     func() anime.SelfEchoRegistry
	newUpdateWriter         func(config anime.UpdateWriterConfig) anime.UpdateWriter
	newChangelogStore       func(db *sql.DB) changelogPendingStore
	newChangelogRecorder    func(bus events.Bus, store changelogPendingStore) changelogRecorder
	newDeviceStore          func(db *sql.DB) device.Store
	newDeviceService        func(store device.Store) device.AuthService
	newHTTPServer           func(config api.Config) api.Server
	newTracerBulletRunner   func(bus events.Bus, sink tracerbullet.TraceSink) tracerBulletRunner
	newTracerBulletSink     func() tracerbullet.TraceSink
	eventBus                events.Bus
	animeStartupCoordinator anime.StartupCoordinator
	animeRuntimeWatcher     anime.RuntimeWatcher
	animeUpdateWriter       anime.UpdateWriter
	syncChangelogRecorder   changelogRecorder
	httpServer              api.Server
	tracerBulletRunner      tracerBulletRunner
	catchUpContext          context.Context
	catchUpCancel           context.CancelFunc
}

type tracerBulletRunner interface {
	Start()
}

type changelogPendingStore interface {
	InsertPending(ctx context.Context, entry bridgeSync.ChangelogEntry) error
}

type changelogRecorder interface {
	Start(ctx context.Context)
	Stop()
	Err() error
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		bootstrapBridgeDB:     bridgeSync.BootstrapBridgeDB,
		resolveAnimeDataPath:  anime.ResolveAnimeDataPath,
		newSnapshotParser:     anime.NewSnapshotParser,
		newSnapshotStore:      func(db *sql.DB) anime.SnapshotStore { return bridgeSync.NewAnimeSnapshotStore(db) },
		newStartupCoordinator: anime.NewStartupCoordinator,
		newRuntimeWatcher: func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
			return anime.NewRuntimeWatcher(config)
		},
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter: func(config anime.UpdateWriterConfig) anime.UpdateWriter {
			return anime.NewUpdateWriter(config)
		},
		newChangelogStore: func(db *sql.DB) changelogPendingStore {
			return bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
		},
		newChangelogRecorder: func(bus events.Bus, store changelogPendingStore) changelogRecorder {
			return bridgeSync.NewChangelogRecorder(bus, store)
		},
		newDeviceStore: func(db *sql.DB) device.Store {
			return device.NewSQLiteStore(db)
		},
		newDeviceService: func(store device.Store) device.AuthService {
			return device.NewService(store)
		},
		newHTTPServer: func(config api.Config) api.Server {
			return api.NewServer(config)
		},
		newTracerBulletRunner: func(bus events.Bus, sink tracerbullet.TraceSink) tracerBulletRunner {
			return tracerbullet.NewRunner(bus, sink)
		},
		newTracerBulletSink: func() tracerbullet.TraceSink {
			return tracerbullet.NewStdoutSink()
		},
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if a.bootstrapBridgeDB == nil {
		a.bootstrapBridgeDB = bridgeSync.BootstrapBridgeDB
	}
	if a.resolveAnimeDataPath == nil {
		a.resolveAnimeDataPath = anime.ResolveAnimeDataPath
	}
	if a.newSnapshotParser == nil {
		a.newSnapshotParser = anime.NewSnapshotParser
	}
	if a.newSnapshotStore == nil {
		a.newSnapshotStore = func(db *sql.DB) anime.SnapshotStore { return bridgeSync.NewAnimeSnapshotStore(db) }
	}
	if a.newStartupCoordinator == nil {
		a.newStartupCoordinator = anime.NewStartupCoordinator
	}
	if a.newRuntimeWatcher == nil {
		a.newRuntimeWatcher = func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
			return anime.NewRuntimeWatcher(config)
		}
	}
	if a.newSelfEchoRegistry == nil {
		a.newSelfEchoRegistry = anime.NewSelfEchoRegistry
	}
	if a.newUpdateWriter == nil {
		a.newUpdateWriter = func(config anime.UpdateWriterConfig) anime.UpdateWriter {
			return anime.NewUpdateWriter(config)
		}
	}
	if a.newChangelogStore == nil {
		a.newChangelogStore = func(db *sql.DB) changelogPendingStore {
			return bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
		}
	}
	if a.newChangelogRecorder == nil {
		a.newChangelogRecorder = func(bus events.Bus, store changelogPendingStore) changelogRecorder {
			return bridgeSync.NewChangelogRecorder(bus, store)
		}
	}
	if a.newDeviceStore == nil {
		a.newDeviceStore = func(db *sql.DB) device.Store {
			return device.NewSQLiteStore(db)
		}
	}
	if a.newDeviceService == nil {
		a.newDeviceService = func(store device.Store) device.AuthService {
			return device.NewService(store)
		}
	}
	if a.newHTTPServer == nil {
		a.newHTTPServer = func(config api.Config) api.Server {
			return api.NewServer(config)
		}
	}
	if a.newTracerBulletRunner == nil {
		a.newTracerBulletRunner = func(bus events.Bus, sink tracerbullet.TraceSink) tracerBulletRunner {
			return tracerbullet.NewRunner(bus, sink)
		}
	}
	if a.newTracerBulletSink == nil {
		a.newTracerBulletSink = func() tracerbullet.TraceSink {
			return tracerbullet.NewStdoutSink()
		}
	}
	if a.eventBus == nil {
		a.eventBus = events.NewBus()
	}
	a.tracerBulletRunner = a.newTracerBulletRunner(a.eventBus, a.newTracerBulletSink())
	a.tracerBulletRunner.Start()

	a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
	if a.startupErr != nil {
		return
	}

	animeDataPath, err := a.resolveAnimeDataPath()
	if err != nil {
		a.startupErr = err
		return
	}

	catchUpContext, catchUpCancel := context.WithCancel(ctx)
	a.catchUpContext = catchUpContext
	a.catchUpCancel = catchUpCancel
	selfEchoRegistry := a.newSelfEchoRegistry()
	a.animeStartupCoordinator = a.newStartupCoordinator(anime.StartupCoordinatorConfig{
		FilePath:  animeDataPath,
		Parser:    a.newSnapshotParser(),
		Store:     a.newSnapshotStore(a.bridgeDB),
		Publisher: a.eventBus,
		Logger:    anime.NewStdLogger(),
	})
	a.animeStartupCoordinator.StartAsync(catchUpContext)
	a.animeRuntimeWatcher = a.newRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath:         animeDataPath,
		Parser:           a.newSnapshotParser(),
		Store:            a.newSnapshotStore(a.bridgeDB),
		Publisher:        a.eventBus,
		Logger:           anime.NewStdLogger(),
		SelfEchoRegistry: selfEchoRegistry,
		RetryDelay:       100 * time.Millisecond,
	})
	a.animeRuntimeWatcher.StartAsync(catchUpContext)
	a.animeUpdateWriter = a.newUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         animeDataPath,
		Bus:              a.eventBus,
		Publisher:        a.eventBus,
		Logger:           anime.NewStdLogger(),
		SelfEchoRegistry: selfEchoRegistry,
	})
	a.animeUpdateWriter.StartAsync(catchUpContext)
	a.syncChangelogRecorder = a.newChangelogRecorder(a.eventBus, a.newChangelogStore(a.bridgeDB))
	a.syncChangelogRecorder.Start(catchUpContext)
	deviceStore := a.newDeviceStore(a.bridgeDB)
	deviceService := a.newDeviceService(deviceStore)
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)
	animeQuery := anime.NewQueryService(snapshotStore)
	animeWrite := anime.NewWriteService(snapshotStore, a.eventBus)
	syncTrigger := bridgeSync.NewTriggerService(a.eventBus)
	a.httpServer = a.newHTTPServer(api.Config{
		DeviceService: deviceService,
		AnimeQuery:    animeQuery,
		AnimeWrite:    animeWrite,
		SyncTrigger:   syncTrigger,
	})
	if err := a.httpServer.Start(); err != nil {
		a.startupErr = err
		return
	}
}

func (a *App) shutdown(ctx context.Context) {
	if a.catchUpCancel != nil {
		a.catchUpCancel()
	}
	if a.httpServer != nil {
		_ = a.httpServer.Shutdown(ctx)
	}
	if a.syncChangelogRecorder != nil {
		a.syncChangelogRecorder.Stop()
	}
	if a.animeUpdateWriter != nil {
		a.animeUpdateWriter.Wait()
	}
	if a.animeRuntimeWatcher != nil {
		a.animeRuntimeWatcher.Wait()
	}
	if a.animeStartupCoordinator != nil {
		a.animeStartupCoordinator.Wait()
	}
	if a.bridgeDB != nil {
		_ = a.bridgeDB.Close()
	}
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
