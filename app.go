package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/schedule"
	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
	"autoreas-bridge/internal/tray"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
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
}

const observabilityEventName = "observability.log"
const pairingTokenConsumedEventName = "pairing.token-consumed"

func defaultObservabilityEmit(ctx context.Context, eventName string, optionalData ...interface{}) {
	if ctx == nil || ctx == context.Background() || ctx == context.TODO() {
		return
	}
	wruntime.EventsEmit(ctx, eventName, optionalData...)
}

// defaultNotifier builds the default Notifier: a Dispatcher fanning out to
// the UI-toast adapter (reusing the same emit-fn mechanism as
// defaultObservabilityEmit), the build-tag-selected desktop-toast adapter,
// and -- when a non-nil shared logger is supplied -- the SDD-29 log-forward
// adapter mirroring every notification into the observability log stream
// (design.md §2.4, ADR-29-3). loggers was accepted for parity with other
// new* constructors (e.g. newChangelogRecorder) and "future observability
// hooks"; this is that hook.
func defaultNotifier(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
	adapters := []notification.Adapter{
		notification.NewUIToastAdapter(emit),
		notification.NewDesktopToastAdapter(),
	}
	if len(loggers) > 0 && loggers[0] != nil {
		adapters = append(adapters, notification.NewLogForwardAdapter(loggers[0]))
	}
	return notification.NewDispatcher(adapters...)
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
	app.bootstrapBridgeDB = bridgeSync.BootstrapBridgeDB
	app.resolveAnimeDataPath = anime.ResolveAnimeDataPath
	app.newSnapshotParser = anime.NewSnapshotParser
	app.newSnapshotStore = func(db *sql.DB) anime.SnapshotStore { return bridgeSync.NewAnimeSnapshotStore(db) }
	app.newStartupCoordinator = anime.NewStartupCoordinator
	app.newRuntimeWatcher = func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
		return anime.NewRuntimeWatcher(config)
	}
	app.newSelfEchoRegistry = anime.NewSelfEchoRegistry
	app.newUpdateWriter = func(config anime.UpdateWriterConfig) anime.UpdateWriter {
		return anime.NewUpdateWriter(config)
	}
	app.newChangelogStore = func(db *sql.DB) changelogPendingStore {
		return bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
	}
	app.newChangelogRecorder = func(bus events.Bus, store changelogPendingStore, loggers ...sharedlogger.Logger) changelogRecorder {
		return bridgeSync.NewChangelogRecorder(bus, store, loggers...)
	}
	app.newDeviceStore = func(db *sql.DB) device.Store {
		return device.NewSQLiteStore(db)
	}
	app.newDeviceService = func(store device.Store) device.AuthService {
		return device.NewService(store)
	}
	app.newNotifier = func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
		return defaultNotifier(emit, loggers...)
	}
	app.newRealtimeHub = func(ctx context.Context) realtime.Hub {
		return realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{Logger: app.sharedLogger})
	}
	app.newHTTPServer = func(config api.Config) api.Server {
		return api.NewServer(config)
	}
	app.newTrayManager = func() tray.TrayManager {
		return tray.NewSystrayManager()
	}
	app.newTracerBulletRunner = func(bus events.Bus, sink tracerbullet.TraceSink, loggers ...sharedlogger.Logger) tracerBulletRunner {
		return tracerbullet.NewRunner(bus, sink, loggers...)
	}
	app.newTracerBulletSink = func() tracerbullet.TraceSink {
		return tracerbullet.NewStdoutSink()
	}
	app.newDownloadStore = func(db *sql.DB) download.DownloadStore {
		return download.NewSQLiteStore(db)
	}
	app.newDownloadService = func(deps download.ServiceDeps) *download.Service {
		return download.NewService(deps)
	}
	app.newDownloadScheduler = func(deps schedule.Deps) schedule.Scheduler {
		return schedule.NewScheduler(deps)
	}
	app.emitFn = defaultObservabilityEmit
	app.hideWindow = wruntime.WindowHide
	app.showWindow = wruntime.WindowShow
	app.unminimiseWindow = wruntime.WindowUnminimise
	app.quitApp = wruntime.Quit
	return app
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
		a.newChangelogRecorder = func(bus events.Bus, store changelogPendingStore, loggers ...sharedlogger.Logger) changelogRecorder {
			return bridgeSync.NewChangelogRecorder(bus, store, loggers...)
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
	if a.newNotifier == nil {
		a.newNotifier = func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier {
			return defaultNotifier(emit, loggers...)
		}
	}
	if a.newRealtimeHub == nil {
		a.newRealtimeHub = func(ctx context.Context) realtime.Hub {
			return realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{Logger: a.sharedLogger})
		}
	}
	if a.newHTTPServer == nil {
		a.newHTTPServer = func(config api.Config) api.Server {
			return api.NewServer(config)
		}
	}
	if a.newTrayManager == nil {
		a.newTrayManager = func() tray.TrayManager { return nil }
	}
	if a.newTracerBulletRunner == nil {
		a.newTracerBulletRunner = func(bus events.Bus, sink tracerbullet.TraceSink, loggers ...sharedlogger.Logger) tracerBulletRunner {
			return tracerbullet.NewRunner(bus, sink, loggers...)
		}
	}
	if a.newTracerBulletSink == nil {
		a.newTracerBulletSink = func() tracerbullet.TraceSink {
			return tracerbullet.NewStdoutSink()
		}
	}
	if a.newDownloadStore == nil {
		a.newDownloadStore = func(db *sql.DB) download.DownloadStore {
			return download.NewSQLiteStore(db)
		}
	}
	if a.newDownloadService == nil {
		a.newDownloadService = func(deps download.ServiceDeps) *download.Service {
			return download.NewService(deps)
		}
	}
	if a.newDownloadScheduler == nil {
		a.newDownloadScheduler = func(deps schedule.Deps) schedule.Scheduler {
			return schedule.NewScheduler(deps)
		}
	}
	if a.hideWindow == nil {
		a.hideWindow = wruntime.WindowHide
	}
	if a.showWindow == nil {
		a.showWindow = wruntime.WindowShow
	}
	if a.unminimiseWindow == nil {
		a.unminimiseWindow = wruntime.WindowUnminimise
	}
	if a.quitApp == nil {
		a.quitApp = wruntime.Quit
	}
	if a.emitFn == nil {
		a.emitFn = defaultObservabilityEmit
	}
	if a.memLogger == nil {
		a.memLogger = sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{
			Capacity: 500,
			OnWriteFn: func(entry sharedlogger.LogEntry) {
				if a.ctx == nil || a.emitFn == nil {
					return
				}
				a.emitFn(a.ctx, observabilityEventName, entry)
			},
		})
	}
	if a.sharedLogger == nil {
		a.sharedLogger = sharedlogger.NewFanoutLogger(sharedlogger.NewStdoutLogger(nil), a.memLogger)
	}
	if a.eventBus == nil {
		a.eventBus = events.NewInstrumentedBus(events.NewBus(), a.sharedLogger)
	}
	a.tracerBulletRunner = a.newTracerBulletRunner(a.eventBus, a.newTracerBulletSink(), a.sharedLogger)
	a.tracerBulletRunner.Start()
	a.trayManager = a.newTrayManager()
	if a.trayManager != nil {
		a.startupErr = a.trayManager.Start(tray.Config{
			Icon:    tray.DefaultIcon,
			Tooltip: tray.DefaultTooltip,
			OnOpen:  a.openMainWindow,
			OnExit:  a.requestQuit,
		})
		if a.startupErr != nil {
			return
		}
		a.hideWindow(ctx)
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

	catchUpContext, catchUpCancel := context.WithCancel(ctx)
	a.catchUpContext = catchUpContext
	a.catchUpCancel = catchUpCancel
	// a.notifier MUST be constructed before the runtime watcher factory call
	// below, since RuntimeWatcherConfig.Notifier (SDD-29) captures a.notifier
	// by value at construction time -- moved up from its previous position
	// (originally after the watcher build) to actually satisfy the ordering
	// design.md §2.2/§8 assumed already held.
	a.notifier = a.newNotifier(a.emitFn, a.sharedLogger)
	selfEchoRegistry := a.newSelfEchoRegistry()
	a.animeStartupCoordinator = a.newStartupCoordinator(anime.StartupCoordinatorConfig{
		FilePath:     animeDataPath,
		Parser:       a.newSnapshotParser(),
		Store:        a.newSnapshotStore(a.bridgeDB),
		Publisher:    a.eventBus,
		Logger:       anime.NewStdLogger(),
		SharedLogger: a.sharedLogger,
	})
	a.animeStartupCoordinator.StartAsync(catchUpContext)
	a.animeRuntimeWatcher = a.newRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath:         animeDataPath,
		Parser:           a.newSnapshotParser(),
		Store:            a.newSnapshotStore(a.bridgeDB),
		Publisher:        a.eventBus,
		Logger:           anime.NewStdLogger(),
		SharedLogger:     a.sharedLogger,
		SelfEchoRegistry: selfEchoRegistry,
		RetryDelay:       100 * time.Millisecond,
		Notifier:         a.notifier,
	})
	a.animeRuntimeWatcher.StartAsync(catchUpContext)
	a.animeUpdateWriter = a.newUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         animeDataPath,
		Bus:              a.eventBus,
		Publisher:        a.eventBus,
		Logger:           anime.NewStdLogger(),
		SharedLogger:     a.sharedLogger,
		SelfEchoRegistry: selfEchoRegistry,
	})
	a.animeUpdateWriter.StartAsync(catchUpContext)
	a.syncChangelogRecorder = a.newChangelogRecorder(a.eventBus, a.newChangelogStore(a.bridgeDB), a.sharedLogger)
	a.syncChangelogRecorder.Start(catchUpContext)
	deviceStore := a.newDeviceStore(a.bridgeDB)
	a.deviceStore = deviceStore
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
	animeWrite := anime.NewWriteService(snapshotStore, a.animeUpdateWriter)
	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(a.bridgeDB))
	statusService := bridgeSync.NewStatusService(changelogStore, func() string {
		if a.httpServer == nil {
			return ""
		}
		return a.httpServer.EffectiveAddress()
	})
	conflictService := bridgeSync.NewConflictStore(a.bridgeDB)
	syncTrigger := bridgeSync.NewTriggerService(a.eventBus, changelogStore, a.sharedLogger)
	a.syncTrigger = syncTrigger
	a.httpServer = a.newHTTPServer(api.Config{
		DeviceService: deviceService,
		AnimeQuery:    a.animeQuery,
		AnimeWrite:    animeWrite,
		SyncTrigger:   syncTrigger,
		Status:        statusService,
		DeviceAdmin:   deviceService.(device.AdminService),
		Conflicts:     conflictService,
		RealtimeHub:   a.realtimeHub,
		Logger:        a.sharedLogger,
		OnPairingTokenConsumed: func() {
			if a.ctx == nil || a.emitFn == nil {
				return
			}
			a.emitFn(a.ctx, pairingTokenConsumedEventName)
			if a.notifier != nil {
				_ = a.notifier.Notify(a.ctx, notification.Notification{
					Source:    "device",
					Level:     notification.LevelSuccess,
					Title:     "Device paired",
					Body:      "A mobile device successfully paired with this bridge.",
					Timestamp: time.Now(),
				})
			}
		},
	})
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
func (a *App) startDownloadOrchestration(ctx context.Context) {
	if a.bridgeDB == nil {
		return
	}

	a.downloadStore = a.newDownloadStore(a.bridgeDB)

	registry := download.NewStaticRegistry()
	registry.Register(jkanime.New(nil))

	hosterResolver := download.NewHosterResolver(func(site string) []download.HosterPriorityEntry {
		entries, err := a.downloadStore.ListHosterPriority(ctx, site)
		if err != nil {
			return nil
		}
		return entries
	})

	a.downloadService = a.newDownloadService(download.ServiceDeps{
		Animes:       a.animeQuery,
		Sites:        registry,
		Hosters:      hosterResolver,
		JD:           newReconfigurableJDClient(a.downloadStore),
		Counter:      filesystem.NewEpisodeCounter(),
		Flattener:    filesystem.NewFlattener(),
		Store:        a.downloadStore,
		Notifier:     a.notifier,
		Bus:          a.eventBus,
		Logger:       a.sharedLogger,
		JDDeviceName: a.downloadJDDeviceName(ctx),
	})

	if _, err := a.downloadStore.ReconcileInterruptedRuns(ctx, time.Now().UnixMilli()); err != nil && a.sharedLogger != nil {
		a.sharedLogger.Warnf("download", "failed to reconcile interrupted download runs at startup: %v", err)
	}

	a.downloadScheduler = a.newDownloadScheduler(schedule.Deps{
		Store: a.downloadStore,
		Clock: schedule.NewRealClock(),
		Run: func(runCtx context.Context, trigger string) error {
			if a.downloadService == nil {
				return nil
			}
			_, err := a.downloadService.RunOnce(runCtx, trigger)
			return err
		},
		Log: a.sharedLogger,
	})
	a.downloadScheduler.Start(ctx)
}

// downloadJDDeviceName reads the configured MyJDownloader device name from the store so the
// Service's liveness gate (EnsureOnline) targets the right device; "" degrades to "no device
// configured yet" rather than failing startup.
func (a *App) downloadJDDeviceName(ctx context.Context) string {
	if a.downloadStore == nil {
		return ""
	}
	cfg, err := a.downloadStore.GetJDConfig(ctx)
	if err != nil {
		return ""
	}
	return cfg.DeviceName
}

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

// GetBridgeStatus returns "ok" when all services started successfully,
// or an error description if startup failed.
func (a *App) GetBridgeStatus() string {
	if a.startupErr != nil {
		return a.startupErr.Error()
	}
	return "ok"
}

// GetEffectiveAddress returns the local LAN address the HTTP server is
// listening on (e.g. "192.168.1.5:8080"), or "" if not yet started.
func (a *App) GetEffectiveAddress() string {
	if a.httpServer == nil {
		return ""
	}
	return a.httpServer.EffectiveAddress()
}

// TriggerReconcile asks the sync service to publish a reconciliation event.
// Returns "ok" on success or an error string if the service is unavailable.
func (a *App) TriggerReconcile() string {
	if a.syncTrigger == nil {
		return "sync service unavailable"
	}
	if err := a.syncTrigger.TriggerReconcile(a.ctx); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetSQLiteStatus returns "ok" when the bridge DB is initialized and reachable,
// or an error string if nil or unreachable.
func (a *App) GetSQLiteStatus() string {
	if a.bridgeDB == nil {
		return "db unavailable"
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	if err := a.bridgeDB.PingContext(ctx); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetPairingToken generates a 32-char hex token, persists it via device.Store,
// and returns it. Returns an error string if the device store is nil.
func (a *App) GetPairingToken() string {
	if a.deviceStore == nil {
		return "device store unavailable"
	}
	genToken := a.newToken
	if genToken == nil {
		genToken = func() (string, error) {
			buf := make([]byte, 16)
			if _, err := rand.Read(buf); err != nil {
				return "", err
			}
			return hex.EncodeToString(buf), nil
		}
	}
	token, err := genToken()
	if err != nil {
		return fmt.Sprintf("token generation failed: %s", err.Error())
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	if err := a.deviceStore.SavePairingToken(ctx, token, time.Now().UnixMilli()); err != nil {
		return fmt.Sprintf("token persist failed: %s", err.Error())
	}
	return token
}

func (a *App) GetRecentLogs() []sharedlogger.LogEntry {
	if a.memLogger == nil {
		return []sharedlogger.LogEntry{}
	}
	return a.memLogger.Recent()
}

func (a *App) GetSyncingAnimeItems() []contracts.SyncingAnimeItem {
	if a.syncTrigger == nil {
		return []contracts.SyncingAnimeItem{}
	}

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}

	items, err := a.syncTrigger.ListPendingAnimeSyncs(ctx)
	if err != nil {
		return []contracts.SyncingAnimeItem{}
	}

	return items
}

// GetAnimes returns the full anime catalog from the local snapshot store,
// including both active and inactive animes. Degrades to an empty slice when
// the query service is unavailable.
func (a *App) GetAnimes() []contracts.AnimeListItem {
	if a.animeQuery == nil {
		return []contracts.AnimeListItem{}
	}

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}

	items, err := a.animeQuery.ListAnimeItems(ctx)
	if err != nil {
		return []contracts.AnimeListItem{}
	}

	return items
}
