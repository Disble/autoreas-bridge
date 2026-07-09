package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"sync"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/realtime"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
	"autoreas-bridge/internal/tray"

	"github.com/google/uuid"
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
	chapterService          chapterCommandService
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
	coverResolver           coverResolver
	notifier                notification.Notifier
	newDownloadStore        func(db *sql.DB) download.DownloadStore
	newDownloadService      func(deps download.ServiceDeps) *download.Service
	newDownloadScheduler    func(deps schedule.Deps) schedule.Scheduler
	downloadStore           download.DownloadStore
	downloadService         *download.Service
	downloadScheduler       schedule.Scheduler
	soloDownloadMu          sync.Mutex
	newSeasonStore          func(db *sql.DB) season.Repository
	seasonService           *season.Service
	settingsStore           appSettingsStore
	animeWrite              *anime.WriteService
	seasonScheduler         schedule.Scheduler
	openURL                 func(ctx context.Context, url string)
	openFolder              func(path string) error
	pickFolder              func(ctx context.Context, title string) (string, error)
	copyText                func(ctx context.Context, value string) error
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

// appSettingsStore is the narrow port for reading/writing global user
// preferences (app_settings). Nil-tolerant at every binding: a nil store
// degrades to an unset ("") downloads root.
type appSettingsStore interface {
	DownloadsRoot(ctx context.Context) (string, error)
	SetDownloadsRoot(ctx context.Context, path string) error
}

type changelogPendingStore interface {
	InsertPending(ctx context.Context, entry bridgeSync.ChangelogEntry) error
}

type changelogRecorder interface {
	Start(ctx context.Context)
	Stop()
	Err() error
}

type chapterCommandService interface {
	ListChapterSchedule(ctx context.Context, query anime.ChapterScheduleQuery) ([]anime.ChapterScheduleItem, error)
	AdjustWatchedChapters(ctx context.Context, cmd anime.AdjustWatchedChaptersCommand) (anime.ChapterCommandResult, error)
	SetAnimeState(ctx context.Context, cmd anime.SetAnimeStateCommand) (anime.ChapterCommandResult, error)
	SetAnimeDays(ctx context.Context, cmd anime.SetAnimeDaysCommand) (anime.ChapterCommandResult, error)
	SoftDeleteAnime(ctx context.Context, cmd anime.SoftDeleteAnimeCommand) (anime.ChapterCommandResult, error)
	RestoreAnime(ctx context.Context, cmd anime.RestoreAnimeCommand) (anime.ChapterCommandResult, error)
	RepeatAnime(ctx context.Context, cmd anime.RepeatAnimeCommand) (anime.ChapterCommandResult, error)
	ListChapterDayCounts(ctx context.Context) ([]anime.ChapterDayCount, error)
}

// coverResolver is the local seam GetAnimeCover depends on (mirrors
// chapterCommandService above) so app_runtime_test.go can inject a fake
// without a real HTTP client. The real implementation is *cover.Resolver
// (internal/anime/cover), wired in startup via cover.NewDefaultResolver.
type coverResolver interface {
	Resolve(ctx context.Context, animeID, portadaPath string) cover.Result
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
	a.seasonService = season.NewService(a.newSeasonStore(a.bridgeDB), time.Now, uuid.NewString, newJkanimeNameSearcher())
	a.settingsStore = settings.NewSQLiteStore(a.bridgeDB)
	deviceService := a.newDeviceService(deviceStore)
	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(a.bridgeDB))
	if service, ok := deviceService.(interface{ SetSyncStateStore(device.SyncStateStore) }); ok {
		service.SetSyncStateStore(syncDeviceStateAdapter{store: changelogStore})
	}
	if a.canUseBridgeDB(ctx) {
		a.notifyDeviceSyncHealth(ctx, changelogStore)
	}
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
	// cover.NewDefaultResolver never fails construction (a cache-root
	// resolution error degrades to a no-op cache internally), so this wiring
	// is nil-safe by design -- see internal/anime/cover/production.go.
	a.coverResolver = cover.NewDefaultResolver(0)
	conflictService := bridgeSync.NewConflictStore(a.bridgeDB)
	a.animeWrite = anime.NewWriteService(snapshotStore, a.animeUpdateWriter)
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
	a.animeWrite.SetDeps(anime.WriteServiceDeps{
		Conflicts:      conflictService,
		Notifier:       a.notifier,
		Logger:         a.sharedLogger,
		OCCObserveOnly: true,
	})
	a.wireChapterServiceWithWriter(a.animeWrite)
	mobileAnimeWrite := activityAnimeWriteService{
		query:    a.animeQuery,
		writer:   a.animeWrite,
		recorder: activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB))},
		source:   anime.ActivitySourceMobile,
		now:      func() int64 { return time.Now().UnixMilli() },
	}
	statusService := bridgeSync.NewStatusService(changelogStore, func() string {
		if a.httpServer == nil {
			return ""
		}
		return a.httpServer.EffectiveAddress()
	}, a.seasonModeReader())
	syncTrigger := bridgeSync.NewTriggerService(a.eventBus, changelogStore, a.sharedLogger)
	a.syncTrigger = syncTrigger
	a.httpServer = a.buildHTTPServer(deviceService, mobileAnimeWrite, conflictService, statusService, syncTrigger)
	if err := a.httpServer.Start(); err != nil {
		a.startupErr = err
		return
	}

	a.startDownloadOrchestration(ctx)
	a.startSeasonAvailability(ctx)
}

func (a *App) wireChapterServiceWithWriter(writer contracts.AnimeWriteService) {
	if a.animeQuery == nil || writer == nil {
		return
	}
	deps := anime.ChapterServiceDeps{
		Query:  a.animeQuery,
		Writer: writer,
	}
	if a.bridgeDB != nil {
		deps.Activity = activityRecorderAdapter{
			store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB)),
		}
	}
	a.chapterService = anime.NewChapterService(deps)
}

func (a *App) wireChapterService(conflictWriter anime.ConflictWriter) {
	if a.bridgeDB == nil || a.animeUpdateWriter == nil {
		return
	}
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)
	writer := anime.NewWriteService(snapshotStore, a.animeUpdateWriter)
	if conflictWriter != nil {
		writer.SetDeps(anime.WriteServiceDeps{
			Conflicts:      conflictWriter,
			Notifier:       a.notifier,
			Logger:         a.sharedLogger,
			OCCObserveOnly: true,
		})
	}
	a.wireChapterServiceWithWriter(writer)
}

type activityRecorderAdapter struct {
	store *activity.Store
}

func (a activityRecorderAdapter) RecordActivity(ctx context.Context, record anime.ActivityRecord) error {
	beforeJSON, err := json.Marshal(record.Before)
	if err != nil {
		return err
	}
	afterJSON, err := json.Marshal(record.After)
	if err != nil {
		return err
	}
	return a.store.RecordActivity(ctx, activity.Record{
		Source:        record.Source,
		ActionType:    record.ActionType,
		AnimeID:       record.AnimeID,
		AnimeName:     record.AnimeName,
		OccurredAtMs:  record.OccurredAtMs,
		CorrelationID: record.CorrelationID,
		BeforeJSON:    beforeJSON,
		AfterJSON:     afterJSON,
	})
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
