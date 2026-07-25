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
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/realtime"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
	"autoreas-bridge/internal/tray"
)

// App struct
type App struct {
	ctx                      context.Context
	bridgeDB                 *sql.DB
	bridgeDBCloser           interface{ Close() error }
	startupErr               error
	sharedLogger             *sharedlogger.FanoutLogger
	memLogger                *sharedlogger.MemLogger
	syncTrigger              *bridgeSync.TriggerService
	bootstrapBridgeDB        func() (*sql.DB, error)
	newSelfEchoRegistry      func() anime.SelfEchoRegistry
	newUpdateWriter          func(config anime.UpdateWriterConfig) anime.UpdateWriter
	newChangelogStore        func(db *sql.DB) changelogPendingStore
	newChangelogRecorder     func(bus events.Bus, store changelogPendingStore, loggers ...sharedlogger.Logger) changelogRecorder
	newDeviceStore           func(db *sql.DB) device.Store
	newDeviceService         func(store device.Store) device.AuthService
	newNotifier              func(emit func(ctx context.Context, eventName string, optionalData ...interface{}), loggers ...sharedlogger.Logger) notification.Notifier
	newRealtimeHub           func(ctx context.Context) realtime.Hub
	newHTTPServer            func(config api.Config) api.Server
	newCaptureQueue          func(db *sql.DB) captureQueue
	newCaptureReader         func(db *sql.DB) *requestcapture.Reader
	newTrayManager           func() tray.Manager
	newTracerBulletRunner    func(bus events.Bus, sink tracerbullet.TraceSink, loggers ...sharedlogger.Logger) tracerBulletRunner
	newTracerBulletSink      func() tracerbullet.TraceSink
	emitFn                   func(ctx context.Context, eventName string, optionalData ...interface{})
	hideWindow               func(context.Context)
	showWindow               func(context.Context)
	unminimiseWindow         func(context.Context)
	quitApp                  func(context.Context)
	eventBus                 events.Bus
	animeUpdateWriter        anime.UpdateWriter
	episodeService           episodeCommandService
	syncChangelogRecorder    changelogRecorder
	realtimeHub              realtime.Hub
	httpServer               api.Server
	captureQueue             captureQueue
	captureReader            *requestcapture.Reader
	trayManager              tray.Manager
	tracerBulletRunner       tracerBulletRunner
	catchUpContext           context.Context
	catchUpCancel            context.CancelFunc
	animeSelfEchoRegistry    anime.SelfEchoRegistry
	deviceStore              device.Store
	newToken                 func() (string, error)
	animeQuery               contracts.AnimeQueryService
	animeEditorQuery         *anime.QueryService
	animeEditorWrite         *anime.EditorService
	animeEditorScheduleQuery *anime.ScheduleQueryService
	animeEditorScheduleWrite *anime.ScheduleService
	coverResolver            coverResolver
	notifier                 notification.Notifier
	newDownloadStore         func(db *sql.DB) download.Store
	newDownloadService       func(deps download.ServiceDeps) *download.Service
	newDownloadScheduler     func(deps schedule.Deps) schedule.Scheduler
	downloadStore            download.Store
	downloadService          *download.Service
	downloadScheduler        schedule.Scheduler
	soloDownloadMu           sync.Mutex
	newSeasonStore           func(db *sql.DB) season.Repository
	seasonService            *season.Service
	settingsStore            appSettingsStore
	animeWrite               *anime.WriteService
	animeCreate              anime.Creator
	animeCreateBatch         anime.BatchCreator
	seasonScheduler          schedule.Scheduler
	openURL                  func(ctx context.Context, url string)
	openFolder               func(path string) error
	pickFolder               func(ctx context.Context, title string) (string, error)
	pickFile                 func(ctx context.Context, title string) (string, error)
	copyText                 func(ctx context.Context, value string) error
	nowTime                  func() time.Time
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

type captureQueue interface {
	TryEnqueue(record requestcapture.CaptureRecord) bool
	Stop(ctx context.Context) requestcapture.QueueStopResult
}

type episodeCommandService interface {
	ListEpisodeSchedule(ctx context.Context, query anime.EpisodeScheduleQuery) ([]anime.EpisodeScheduleItem, error)
	AdjustWatchedEpisodes(ctx context.Context, cmd anime.AdjustWatchedEpisodesCommand) (anime.EpisodeCommandResult, error)
	SetAnimeState(ctx context.Context, cmd anime.SetAnimeStateCommand) (anime.EpisodeCommandResult, error)
	SetAnimeDays(ctx context.Context, cmd anime.SetAnimeDaysCommand) (anime.EpisodeCommandResult, error)
	SoftDeleteAnime(ctx context.Context, cmd anime.SoftDeleteAnimeCommand) (anime.EpisodeCommandResult, error)
	RestoreAnime(ctx context.Context, cmd anime.RestoreAnimeCommand) (anime.EpisodeCommandResult, error)
	RepeatAnime(ctx context.Context, cmd anime.RepeatAnimeCommand) (anime.EpisodeCommandResult, error)
	ListEpisodeDayCounts(ctx context.Context) ([]anime.EpisodeDayCount, error)
}

// coverResolver is the local seam GetAnimeCover depends on (mirrors
// episodeCommandService above) so app_runtime_test.go can inject a fake
// without a real HTTP client. The real implementation is *cover.Resolver
// (internal/anime/cover), wired in startup via cover.NewDefaultResolver.
type coverResolver interface {
	Resolve(ctx context.Context, animeID, portadaPath string) cover.Result
}

// NewApp creates a new App application struct
func NewApp() *App {
	app := &App{}
	app.ensureRuntimeDependencies()
	app.newTrayManager = func() tray.Manager {
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

	if !a.initializeBridgeDatabase(ctx) {
		return
	}
	a.ensureDownloadStore()
	a.configureRuntimeServices(ctx)
	if a.startupErr != nil {
		return
	}
	a.startDownloadOrchestration(ctx)
	a.startSeasonAvailability(ctx)
}

// initializeBridgeDatabase initializes the bridge database during startup.
func (a *App) initializeBridgeDatabase(ctx context.Context) bool {
	a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
	a.bridgeDBCloser = a.bridgeDB
	return a.startupErr == nil
}

// startHTTPServer constructs and starts the bridge HTTP server.
func (a *App) startHTTPServer(deviceService device.AuthService, mobileAnimeWrite contracts.AnimeWriteService, conflictService *bridgeSync.ConflictStore, changelogStore *bridgeSync.ChangelogStore) {
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
	}
}

// wireEpisodeServiceWithWriter connects the episode service to its writer.
func (a *App) wireEpisodeServiceWithWriter(writer contracts.AnimeWriteService) {
	if a.animeQuery == nil || writer == nil {
		return
	}
	deps := anime.EpisodeServiceDeps{
		Query:  a.animeQuery,
		Writer: writer,
	}
	if a.bridgeDB != nil {
		deps.Activity = activityRecorderAdapter{
			store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB)),
		}
	}
	a.episodeService = anime.NewEpisodeService(deps)
}

// wireEpisodeService constructs the episode service and its write dependencies.
func (a *App) wireEpisodeService(conflictWriter anime.ConflictWriter) {
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
	a.wireEpisodeServiceWithWriter(writer)
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

// shutdown stops runtime services and closes bridge resources.
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
	if a.captureQueue != nil {
		_ = a.captureQueue.Stop(ctx)
	}
	if a.animeUpdateWriter != nil {
		a.animeUpdateWriter.Wait()
	}
	if a.bridgeDBCloser != nil {
		_ = a.bridgeDBCloser.Close()
	} else if a.bridgeDB != nil {
		_ = a.bridgeDB.Close()
	}
	a.ctx = ctx
}

// openMainWindow restores and displays the main application window.
func (a *App) openMainWindow() {
	if a.ctx == nil {
		return
	}
	a.unminimiseWindow(a.ctx)
	a.showWindow(a.ctx)
}

// requestQuit asks the application runtime to exit.
func (a *App) requestQuit() {
	if a.ctx == nil {
		return
	}
	a.quitApp(a.ctx)
}
