package main

import (
	"context"
	"database/sql"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/schedule"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/preferences"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
	"autoreas-bridge/internal/tray"
)

// App struct
type App struct {
	ctx                     context.Context
	bridgeDB                *sql.DB
	startupErr              error
	sharedLogger            *sharedlogger.FanoutLogger
	memLogger               *sharedlogger.MemLogger
	syncTrigger             *bridgeSync.TriggerService
	bootstrapBridgeDB       func() (*sql.DB, error)
	resolveAnimeDataPath    func() (string, error)
	newSnapshotParser       func() anime.SnapshotParser
	newSnapshotStore        func(db *sql.DB) anime.SnapshotStore
	newStartupCoordinator   func(config anime.StartupCoordinatorConfig) anime.StartupCoordinator
	newLegacyPullService    func(config anime.LegacyPullServiceConfig) anime.LegacyPullService
	newRuntimeWatcher       func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher
	newSelfEchoRegistry     func() anime.SelfEchoRegistry
	newUpdateWriter         func(config anime.UpdateWriterConfig) anime.UpdateWriter
	newChangelogStore       func(db *sql.DB) changelogPendingStore
	newChangelogRecorder    func(bus events.Bus, store changelogPendingStore, loggers ...sharedlogger.Logger) changelogRecorder
	newDeviceStore          func(db *sql.DB) device.Store
	newDeviceService        func(store device.Store) device.AuthService
	newNotifier             func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier
	newRealtimeHub          func(ctx context.Context) realtime.Hub
	newHTTPServer           func(config api.Config) api.Server
	newTrayManager          func() tray.TrayManager
	newTracerBulletRunner   func(bus events.Bus, sink tracerbullet.TraceSink, loggers ...sharedlogger.Logger) tracerBulletRunner
	newTracerBulletSink     func() tracerbullet.TraceSink
	emitFn                  func(ctx context.Context, eventName string, optionalData ...interface{})
	hideWindow              func(context.Context)
	showWindow              func(context.Context)
	unminimiseWindow        func(context.Context)
	quitApp                 func(context.Context)
	eventBus                events.Bus
	animeStartupCoordinator anime.StartupCoordinator
	animeLegacyPull         anime.LegacyPullService
	animeRuntimeWatcher     anime.RuntimeWatcher
	animeUpdateWriter       anime.UpdateWriter
	syncChangelogRecorder   changelogRecorder
	realtimeHub             realtime.Hub
	httpServer              api.Server
	trayManager             tray.TrayManager
	tracerBulletRunner      tracerBulletRunner
	catchUpContext          context.Context
	catchUpCancel           context.CancelFunc
	deviceStore             device.Store
	newToken                func() (string, error)
	animeQuery              contracts.AnimeQueryService
	notifier                notification.Notifier
	newDownloadStore        func(db *sql.DB) download.DownloadStore
	newDownloadService      func(deps download.ServiceDeps) *download.Service
	newDownloadScheduler    func(deps schedule.Deps) schedule.Scheduler
	downloadStore           download.DownloadStore
	downloadService         *download.Service
	downloadScheduler       schedule.Scheduler
	newPreferencesStore     func(db *sql.DB) preferences.Store
	preferencesStore        preferences.Store
}

const observabilityEventName = "observability.log"
const pairingTokenConsumedEventName = "pairing.token-consumed"

var downloadRuntimeEventNames = [...]string{
	events.EventNameDownloadRunStarted,
	events.EventNameDownloadRunProgress,
	events.EventNameDownloadRunFinished,
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
	app := &App{}
	app.ensureRuntimeDependencies()
	app.newTrayManager = func() tray.TrayManager {
		return tray.NewSystrayManager()
	}
	return app
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.ensureRuntimeDependencies()
	a.registerDownloadRuntimeEventBridge(ctx)
	a.tracerBulletRunner = a.newTracerBulletRunner(a.eventBus, a.newTracerBulletSink(), a.sharedLogger)
	a.tracerBulletRunner.Start()
	if !a.configureTray(ctx) {
		return
	}

	a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
	if a.startupErr != nil {
		return
	}

	animeDataPath, err := a.resolveAnimeDataPath()
	if err != nil {
		a.startupErr = err
		return
	}

	a.startAnimeRuntime(ctx, animeDataPath)
	a.syncChangelogRecorder = a.newChangelogRecorder(a.eventBus, a.newChangelogStore(a.bridgeDB), a.sharedLogger)
	a.syncChangelogRecorder.Start(a.catchUpContext)
	deviceStore := a.newDeviceStore(a.bridgeDB)
	a.deviceStore = deviceStore
	a.preferencesStore = a.newPreferencesStore(a.bridgeDB)
	deviceService := a.newDeviceService(deviceStore)
	a.realtimeHub = a.newRealtimeHub(ctx)
	if a.realtimeHub != nil {
		a.eventBus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
			changed, ok := event.(events.AnimeChangedEvent)
			if !ok {
				return
			}
			a.realtimeHub.BroadcastAnimeChanged(ctx, changed)
		})
	}
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)
	a.animeQuery = anime.NewQueryService(snapshotStore)
	conflictService := bridgeSync.NewConflictStore(a.bridgeDB)
	animeWrite := anime.NewWriteService(snapshotStore, a.animeUpdateWriter)
	// SDD-30 ADR-30-4: wire the conflict writer + notifier the same way
	// download.ServiceDeps wires its Notifier (app.go:477) -- a.notifier is
	// already constructed by this point (app.go:351).
	//
	// OCCObserveOnly is set TRUE for the staged rollout (docs/sync-occ-mobile-contract.md):
	// until Autoreas Mobile starts echoing the `base` version token, an existing
	// record edited by an old client arrives with base=nil and would otherwise be
	// recorded as a (non-applied) conflict -- a regression for current clients.
	// Observe-only keeps last-write-wins working and logs would-be conflicts; flip
	// to false to enable full enforcement once mobile ships the `base` echo.
	animeWrite.SetDeps(anime.WriteServiceDeps{
		Conflicts:      conflictService,
		Notifier:       a.notifier,
		Logger:         a.sharedLogger,
		OCCObserveOnly: true,
	})
	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(a.bridgeDB))
	statusService := bridgeSync.NewStatusService(changelogStore, func() string {
		if a.httpServer == nil {
			return ""
		}
		return a.httpServer.EffectiveAddress()
	})
	syncTrigger := bridgeSync.NewTriggerService(a.eventBus, changelogStore, a.sharedLogger)
	a.syncTrigger = syncTrigger
	a.httpServer = a.buildHTTPServer(deviceService, animeWrite, conflictService, statusService, syncTrigger)
	if err := a.httpServer.Start(); err != nil {
		a.startupErr = err
		return
	}

	a.startDownloadOrchestration(ctx)
}

// startDownloadOrchestration wires the SDD-28 download bounded context (design.md §3/§6/§8,
// PR4b Phase 6): DownloadStore -> Service -> Scheduler, reconciling any zombie "running" row
// left behind by a previous crash BEFORE the scheduler's loop starts (design §8 crash-zombie
// reconciliation). Failures here are logged and degrade to a nil downloadScheduler/Service --
// they NEVER fail overall app startup, since auto-download is an optional feature layered on
// top of the core sync/anime bounded contexts.
func (a *App) shutdown(ctx context.Context) {
	if a.catchUpCancel != nil {
		a.catchUpCancel()
	}
	if a.downloadScheduler != nil {
		a.downloadScheduler.Stop()
	}
	if a.httpServer != nil {
		_ = a.httpServer.Shutdown(ctx)
	}
	if a.trayManager != nil {
		_ = a.trayManager.Stop()
	}
	if closer, ok := a.realtimeHub.(interface{ Close() error }); ok && closer != nil {
		_ = closer.Close()
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

func (a *App) openMainWindow() {
	if a.ctx == nil {
		return
	}
	a.unminimiseWindow(a.ctx)
	a.showWindow(a.ctx)
}

func (a *App) requestQuit() {
	if a.ctx == nil {
		return
	}
	a.quitApp(a.ctx)
}
