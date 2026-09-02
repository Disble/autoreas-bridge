package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/autostart"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/observability/eventlog"
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
	ctx                        context.Context // NOSONAR godre:S8242 -- Wails hands this to OnStartup, and the bindings and tray callbacks that need it have fixed signatures with no ctx to pass in.
	bridgeDB                   *sql.DB
	bridgeDBCloser             interface{ Close() error }
	startupErr                 error
	startupFatal               bool
	sharedLogger               *sharedlogger.FanoutLogger
	memLogger                  *sharedlogger.MemLogger
	syncTrigger                *bridgeSync.TriggerService
	bootstrapBridgeDB          func() (*sql.DB, error)
	newSelfEchoRegistry        func() anime.SelfEchoRegistry
	newUpdateWriter            func(config anime.UpdateWriterConfig) anime.UpdateWriter
	newChangelogStore          func(db *sql.DB) changelogPendingInserter
	newChangelogRecorder       func(bus events.Bus, store changelogPendingInserter, loggers ...sharedlogger.Logger) changelogRecorder
	newDeviceStore             func(db *sql.DB) device.Store
	newDeviceService           func(store device.Store) device.AuthService
	newNotifier                func(emit func(ctx context.Context, eventName string, optionalData ...any), loggers ...sharedlogger.Logger) notification.Notifier
	newRealtimeHub             func(ctx context.Context) realtime.Hub
	newHTTPServer              func(config api.Config) api.Server
	newCaptureStore            func(db *sql.DB) requestcapture.Upserter
	newCaptureQueue            func(db *sql.DB) captureQueue
	newCaptureReader           func(db *sql.DB) *requestcapture.Reader
	newTrayManager             func() tray.Manager
	newAutoStartReconciler     func() autoStartReconciler
	newTracerBulletRunner      func(bus events.Bus, sink tracerbullet.TraceRecorder, loggers ...sharedlogger.Logger) tracerBulletRunner
	newTracerBulletSink        func() tracerbullet.TraceRecorder
	emitFn                     func(ctx context.Context, eventName string, optionalData ...any)
	hideWindow                 func(context.Context)
	showWindow                 func(context.Context)
	unminimiseWindow           func(context.Context)
	quitApp                    func(context.Context)
	eventBus                   events.Bus
	animeUpdateWriter          anime.UpdateWriter
	episodeService             episodeCommandService
	syncChangelogRecorder      changelogRecorder
	realtimeHub                realtime.Hub
	httpServer                 api.Server
	captureQueue               captureQueue
	captureReader              *requestcapture.Reader
	captureStore               requestcapture.Upserter
	eventSink                  *eventlog.Sink
	newEventQueue              func(db *sql.DB) eventLogStopper
	eventQueue                 eventLogStopper
	newEventReader             func(db *sql.DB) *eventlog.Reader
	eventReader                *eventlog.Reader
	trayManager                tray.Manager
	tracerBulletRunner         tracerBulletRunner
	catchUpContext             context.Context // NOSONAR godre:S8242 -- a lifetime, not a request scope: WithCancel(ctx) in startup, cancelled by catchUpCancel in shutdown.
	catchUpCancel              context.CancelFunc
	animeSelfEchoRegistry      anime.SelfEchoRegistry
	deviceStore                device.Store
	newToken                   func() (string, error)
	animeQuery                 contracts.AnimeQueryService
	animeEditorQuery           *anime.QueryService
	animeEditorWrite           *anime.EditorService
	animeEditorScheduleQuery   *anime.ScheduleQueryService
	animeEditorScheduleWrite   *anime.ScheduleService
	coverResolver              coverResolver
	notifier                   notification.Notifier
	notificationCenterStore    *center.Store
	notificationCenterExecutor *center.Executor
	notificationCenterIntents  *center.StaticRegistry
	newDownloadStore           func(db *sql.DB) download.Store
	newDownloadService         func(deps download.ServiceDeps) *download.Service
	newDownloadScheduler       func(deps schedule.Deps) schedule.Scheduler
	downloadStore              download.Store
	downloadService            *download.Service
	readinessService           *download.ReadinessService
	downloadScheduler          schedule.Scheduler
	soloDownloadMu             sync.Mutex
	soloDownloadCancelMu       sync.Mutex
	soloDownloadCancel         context.CancelFunc
	newSeasonStore             func(db *sql.DB) season.Repository
	seasonService              *season.Service
	settingsStore              appSettingsStore
	getenvFn                   func(string) string
	animeWrite                 *anime.WriteService
	animeCreate                anime.Creator
	animeCreateBatch           anime.BatchCreator
	seasonScheduler            schedule.Scheduler
	openURL                    func(ctx context.Context, url string)
	openFolder                 func(path string) error
	pickFolder                 func(ctx context.Context, title string) (string, error)
	pickFile                   func(ctx context.Context, title string) (string, error)
	pickBundle                 func(ctx context.Context, title string) (string, error)
	saveFile                   func(ctx context.Context, title, defaultFilename string) (string, error)
	resolveBridgeDBPath        func() (string, error)
	pendingBackupImport        *pendingBackupImport
	copyText                   func(ctx context.Context, value string) error
	nowTime                    func() time.Time
	processStartedAt           time.Time
}

const observabilityEventName = "observability.log"
const pairingTokenConsumedEventName = "pairing.token-consumed"

var downloadRuntimeEventNames = [...]string{
	events.EventNameDownloadRunStarted,
	events.EventNameDownloadRunProgress,
	events.EventNameDownloadRunFinished,
	events.EventNameDownloadEpisodeAvailable,
	events.EventNameDownloadEpisodeDownloaded,
	events.EventNameDownloadFailed,
	events.EventNameDownloadSkipped,
	events.EventNameDownloadJDStatus,
	events.EventNameDownloadEpisodeDownloading,
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
	AutoStartEnabled(ctx context.Context) (bool, error)
	SetAutoStartEnabled(ctx context.Context, enabled bool) error
	EpisodeRenameEnabled(ctx context.Context) (bool, error)
	SetEpisodeRenameEnabled(ctx context.Context, enabled bool) error
	APIAddr(ctx context.Context) (string, error)
	SetAPIAddr(ctx context.Context, addr string) error
}

// autoStartReconciler synchronizes the Bridge-owned Windows Run value.
type autoStartReconciler interface {
	Reconcile(enabled bool) error
}

var _ autoStartReconciler = (*autostart.Reconciler)(nil)

type changelogPendingInserter interface {
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

// eventLogStopper is the narrow shutdown-time seam for the runtime-event
// persistence queue. *eventlog.Queue satisfies this via its existing Stop
// method; a.eventSink.Bind is still called with the concrete *eventlog.Queue
// (Sink's atomic.Pointer[Queue] binding needs the concrete type), so this
// interface exists only for test-double injection at the App layer.
type eventLogStopper interface {
	Stop(ctx context.Context) eventlog.QueueStopResult
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
	if a.processStartedAt.IsZero() {
		a.processStartedAt = a.currentTime()
	}
	a.ensureRuntimeDependencies()
	a.registerDownloadRuntimeEventBridge(ctx)
	a.registerAnimeRuntimeEventBridge(ctx)
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
	// Only a fatal failure stops startup. A failed HTTP bind is reported through
	// startupErr but must not abort the rest: the server serves mobile sync,
	// while readiness, the download service and the scheduler are local. When a
	// second instance lost the port race this gate used to skip
	// startDownloadOrchestration entirely, leaving readinessService nil and every
	// Downloads panel reporting "Download readiness unavailable".
	if a.startupFatal {
		return
	}
	a.reconcileAutoStart(ctx)
	a.startDownloadOrchestration(ctx)
	a.wireNotificationCenterIntentExecutor()
	// After the executor, so the two tokens this record carries already have their handlers
	// registered by the time it can be pressed -- and once only, because startup is the single
	// moment a missed selected day can begin to exist (app_missed_schedule_notification.go).
	a.notifyMissedSchedule(ctx)
	a.startSeasonAvailability(ctx)
}

// initializeBridgeDatabase initializes the bridge database during startup.
func (a *App) initializeBridgeDatabase(ctx context.Context) bool {
	a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
	a.bridgeDBCloser = a.bridgeDB
	return a.startupErr == nil
}

// startHTTPServer constructs and starts the bridge HTTP server.
func (a *App) startHTTPServer(deviceService device.AuthService, mobileAnimeWrite contracts.AnimePatcher, conflictService *bridgeSync.ConflictStore, changelogStore *bridgeSync.ChangelogStore) {
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
func (a *App) wireEpisodeServiceWithWriter(writer contracts.AnimePatcher) {
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
	// Unbind before Stop: the sink's atomic.Pointer swap takes the nil
	// branch on the logging goroutine and never contends the queue's
	// stop mutex during shutdown.
	if a.eventSink != nil {
		a.eventSink.Unbind()
	}
	if a.eventQueue != nil {
		_ = a.eventQueue.Stop(ctx)
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

// onSecondInstanceLaunch surfaces the running window when another launch is
// attempted. It runs on the first, surviving instance; the second process
// exits before startup, so the app never opens a duplicate window or tray icon.
func (a *App) onSecondInstanceLaunch(options.SecondInstanceData) {
	a.openMainWindow()
}

// requestQuit asks the application runtime to exit.
func (a *App) requestQuit() {
	if a.ctx == nil {
		return
	}
	a.quitApp(a.ctx)
}
