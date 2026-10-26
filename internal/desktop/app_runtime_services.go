package desktop

import (
	"context"
	"fmt"
	"time"
	"uuid"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/retention"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// configureRuntimeServices wires and starts the bridge runtime services.
func (a *App) configureRuntimeServices(ctx context.Context) {
	a.configureCaptureQueue()
	a.sweepOrphanedCaptures()
	a.configureCaptureReader()
	a.configureSyncDiagReader()
	a.configureEventLogQueue(ctx)
	a.prepareAnimeRuntime(ctx)
	a.startSyncChangelogRecorder()
	a.startIncrementalVacuumLoop(bridgeSync.IncrementalVacuumInterval)
	a.startRetentionSweepLoop(retention.SweepInterval)
	deviceService, changelogStore := a.configureBridgeDeviceServices(ctx)
	a.configureRealtimeHub(ctx)
	a.startSeasonProjectionPublisher(ctx)
	conflictService := a.configureAnimeApplicationServices()
	if !a.recoverStagedAnimeWrites(ctx) {
		return
	}
	a.wireEpisodeServiceWithWriter(a.animeWrite)
	a.startHTTPServer(deviceService, a.newMobileAnimeWriteService(), conflictService, changelogStore)
}

// configureCaptureQueue wires the request-capture observability queue when dependencies are present.
func (a *App) configureCaptureQueue() {
	if a.captureQueue != nil || a.bridgeDB == nil || a.newCaptureQueue == nil {
		return
	}
	a.captureQueue = a.newCaptureQueue(a.bridgeDB)
}

// sweepOrphanedCaptures closes capture rows left in their pending arrival shape
// by a process that died before writing their terminal row (force close, crash,
// or a shutdown that tore down the capture queue and its SQLite fallback first).
// Without this they stay 'pending' forever and the Activity view renders them as
// in-flight requests whose elapsed clock grows without bound.
//
// Ordering matters: this runs during configureRuntimeServices, before
// startHTTPServer accepts connections, so no request can legitimately be in
// flight and every pending row present is provably an orphan. Nil-safe when
// bridgeDB is absent (capture persistence simply is not configured -- not a
// failure, so it stays silent), and idempotent across restarts.
func (a *App) sweepOrphanedCaptures() {
	if a.bridgeDB == nil {
		return
	}
	// Mirrors readEventPersistDebugSetting: some unit tests (and any degraded
	// bootstrap) wire a bare, unopened *sql.DB{} that panics on query rather
	// than erroring. A best-effort observability sweep must never take startup
	// down with it.
	defer func() {
		if recovered := recover(); recovered != nil && a.sharedLogger != nil {
			a.logCaptureSweep(map[string]any{"cause": fmt.Sprint(recovered)}, "failed to sweep orphaned capture rows: %v", recovered)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	swept, err := requestcapture.SweepOrphanedCaptures(ctx, a.bridgeDB)
	if err != nil {
		if a.sharedLogger != nil {
			a.logCaptureSweep(map[string]any{"cause": err.Error()}, "failed to sweep orphaned capture rows: %v", err)
		}
		return
	}
	if swept > 0 && a.sharedLogger != nil {
		a.logCaptureSweep(map[string]any{"swept": swept}, "swept %d orphaned capture row(s) left pending by a previous process", swept)
	}
}

// logCaptureSweep writes one capture-sweep warning with its structured metadata, so the kept
// ledger row says how many rows were swept or why the sweep failed. Callers check sharedLogger.
func (a *App) logCaptureSweep(metadata map[string]any, format string, args ...any) {
	a.sharedLogger.Logf("api", sharedlogger.LevelWarn, sharedlogger.Fields{
		EventType: "api.capture_swept",
		Metadata:  metadata,
	}, format, args...)
}

// configureCaptureReader wires the in-process capture read path
// (GetActivityRequest) once, over the app's own
// bridgeDB handle -- never a second SQLite connection (design.md "Read
// handle"). Guarded like configureCaptureQueue: nil-safe when bridgeDB is
// absent, and a no-op once a reader already exists.
func (a *App) configureCaptureReader() {
	if a.captureReader != nil || a.bridgeDB == nil || a.newCaptureReader == nil {
		return
	}
	a.captureReader = a.newCaptureReader(a.bridgeDB)
}

// configureSyncDiagReader wires the in-process device sync diagnostics read
// path (ListDeviceSyncDiagnostics) once, over the app's own bridgeDB handle --
// never a second SQLite connection. It is the exact mirror of
// configureCaptureReader: nil-safe when bridgeDB is absent, and a no-op once a
// reader already exists. The recover exists because the
// constructor probes device_telemetry_events, and a bare, unopened *sql.DB{}
// (as a degraded bootstrap or a unit-test fixture supplies) panics on query
// rather than erroring. Leaving the reader nil there is the correct
// degradation -- the bound read already reports a nil reader as Degraded.
func (a *App) configureSyncDiagReader() {
	if a.syncDiagReader != nil || a.bridgeDB == nil || a.newSyncDiagReader == nil {
		return
	}
	defer func() {
		if recovered := recover(); recovered != nil && a.sharedLogger != nil {
			a.sharedLogger.Warnf("api", "failed to wire the sync diagnostics reader: %v", recovered)
		}
	}()
	a.syncDiagReader = a.newSyncDiagReader(a.bridgeDB)
}

// eventPersistDebugSettingKey is the app_settings key controlling whether
// debug-level runtime events are persisted (default OFF -- see
// eventlog.SinkConfig's PersistDebug documentation).
const eventPersistDebugSettingKey = "observability.events.persist_debug"

// configureEventLogQueue wires the runtime-event persistence queue once
// bridgeDB is bootstrapped: reads the debug-persistence policy from
// app_settings, builds the store + queue via the injectable newEventQueue
// seam, and binds the already-constructed sink to it. Guarded like
// configureCaptureQueue: nil-safe when bridgeDB is absent, a no-op once a
// queue already exists.
func (a *App) configureEventLogQueue(ctx context.Context) {
	if a.eventQueue != nil || a.bridgeDB == nil || a.newEventQueue == nil || a.eventSink == nil {
		return
	}
	persistDebug := a.readEventPersistDebugSetting(ctx)
	queue := a.newEventQueue(a.bridgeDB)
	a.eventQueue = queue
	if realQueue, ok := queue.(*eventlog.Queue); ok {
		a.eventSink.Bind(realQueue, persistDebug)
	}
}

// readEventPersistDebugSetting reads the debug-persistence policy from
// app_settings, defaulting to false (OFF) when unset, on any read error, or
// when bridgeDB is not a genuinely usable handle (some unit tests wire a
// bare, unopened *sql.DB{} that panics on any query rather than erroring;
// the recover keeps this best-effort read from ever failing startup).
func (a *App) readEventPersistDebugSetting(ctx context.Context) (persistDebug bool) {
	defer func() {
		if recover() != nil {
			persistDebug = false
		}
	}()
	value, err := settings.NewSQLiteStore(a.bridgeDB).Get(ctx, eventPersistDebugSettingKey)
	if err != nil {
		return false
	}
	return value == "true"
}

// startSyncChangelogRecorder starts recording sync events from the event bus.
func (a *App) startSyncChangelogRecorder() {
	a.syncChangelogRecorder = a.newChangelogRecorder(a.eventBus, a.newChangelogStore(a.bridgeDB), a.sharedLogger)
	a.syncChangelogRecorder.Start(a.catchUpContext)
}

// startIncrementalVacuumLoop returns free pages to the disk on a timer until
// shutdown cancels the catch-up context, which happens before the database
// closes. interval is IncrementalVacuumInterval in production.
func (a *App) startIncrementalVacuumLoop(interval time.Duration) {
	if a.bridgeDB == nil {
		return
	}
	go bridgeSync.RunIncrementalVacuumLoop(a.catchUpContext, a.bridgeDB, interval, func(format string, args ...any) {
		a.sharedLogger.Warnf("sync", format, args...)
	})
}

// startRetentionSweepLoop applies ADR-028 time retention: one sweep right after
// bootstrap, then one every interval until shutdown cancels the catch-up
// context. interval is retention.SweepInterval in production.
func (a *App) startRetentionSweepLoop(interval time.Duration) {
	if a.bridgeDB == nil {
		return
	}
	warn := func(format string, args ...any) {
		a.sharedLogger.Warnf("sync", format, args...)
	}
	a.sweepRetentionOnce(warn)
	go retention.RunLoop(a.catchUpContext, a.bridgeDB, interval, warn)
}

// sweepRetentionOnce runs the start-up sweep. Like sweepOrphanedCaptures, it
// survives the bare, unopened *sql.DB{} some unit tests and degraded bootstraps
// wire, which panics on query instead of erroring.
func (a *App) sweepRetentionOnce(warn func(string, ...any)) {
	defer func() {
		if recovered := recover(); recovered != nil {
			warn("retention sweep: %v", recovered)
		}
	}()
	if _, err := retention.Sweep(a.catchUpContext, a.bridgeDB, time.Now()); err != nil {
		warn("retention sweep: %v", err)
	}
}

// configureBridgeDeviceServices wires device authentication and changelog services.
func (a *App) configureBridgeDeviceServices(ctx context.Context) (device.AuthService, *bridgeSync.ChangelogStore) {
	deviceStore := a.newDeviceStore(a.bridgeDB)
	a.deviceStore = deviceStore
	jkanimeSearcher := a.newJkanimeNameSearcher()
	a.seasonService = season.NewService(season.WithProjectionSignal(a.newSeasonStore(a.bridgeDB), a.eventBus), time.Now, func() string { return uuid.New().String() }, jkanimeSearcher)
	a.seasonService.SetProviderSearchers(a.newSeasonProviderSearchers(jkanimeSearcher))
	a.settingsStore = settings.NewSQLiteStore(a.bridgeDB)
	deviceService := a.newDeviceService(deviceStore)
	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(a.bridgeDB))
	a.attachDeviceSyncStateStore(deviceService, changelogStore)
	if a.canUseBridgeDB(ctx) {
		a.notifyDeviceSyncHealth(ctx, changelogStore)
	}
	return deviceService, changelogStore
}

// attachDeviceSyncStateStore connects device services to sync-state persistence.
func (a *App) attachDeviceSyncStateStore(deviceService device.AuthService, changelogStore *bridgeSync.ChangelogStore) {
	service, ok := deviceService.(interface{ SetSyncStateStore(device.SyncStateStore) })
	if !ok {
		return
	}
	service.SetSyncStateStore(syncDeviceStateAdapter{store: changelogStore})
}

// configureRealtimeHub creates the realtime hub and subscribes it to anime changes.
func (a *App) configureRealtimeHub(ctx context.Context) {
	a.realtimeHub = a.newRealtimeHub(ctx)
	if a.realtimeHub == nil {
		return
	}
	a.eventBus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		a.realtimeHub.BroadcastAnimeChanged(ctx, changed)
	})
	subscribeHubToEpisodeDurations(ctx, a.eventBus, a.realtimeHub)
}

// configureAnimeApplicationServices constructs the anime application services.
func (a *App) configureAnimeApplicationServices() *bridgeSync.ConflictStore {
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)
	animeQuery := anime.NewQueryService(snapshotStore)
	a.animeQuery = animeQuery
	a.animeEditorQuery = anime.NewQueryService(snapshotStore)
	// cover.NewDefaultResolver never fails construction (a cache-root resolution error degrades
	// to a no-op cache internally), but the derived thumbnail cache needs a real root: if the
	// platform has none, both surfaces keep their documented fail-closed behavior (the desktop
	// binding shows its placeholder, the route answers 503) rather than writing thumbnails
	// somewhere unintended. One service instance is shared by both.
	if root, err := cover.DefaultCacheRoot(); err == nil {
		a.coverThumbnails = cover.NewThumbnailService(cover.NewDefaultResolver(0), root)
	}
	a.watchHistoryQuery = watchhistory.NewStore(a.bridgeDB)
	conflictService := bridgeSync.NewConflictStore(a.bridgeDB)
	a.animeWrite = anime.NewWriteService(snapshotStore, a.animeChangedPublisher)
	a.animeEditorWrite = anime.NewEditorService(snapshotStore, a.animeChangedPublisher)
	a.animeEditorScheduleQuery = anime.NewScheduleQueryService(a.animeEditorQuery)
	a.animeEditorScheduleWrite = anime.NewScheduleService(a.animeEditorQuery, a.animeChangedPublisher)
	deps := a.newAnimeWriteDeps(conflictService)
	a.animeWrite.SetDeps(deps)
	a.animeEditorWrite.SetDeps(deps)
	a.animeEditorScheduleWrite.SetDeps(deps)
	create := anime.NewCreateService(a.animeWrite)
	create.SetQuery(animeQuery)
	a.animeCreate = create
	a.animeCreateBatch = create
	return conflictService
}

// newAnimeWriteDeps builds shared dependencies for anime write services.
func (a *App) newAnimeWriteDeps(conflictService *bridgeSync.ConflictStore) anime.WriteServiceDeps {
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
	//
	// SaveRule is the season's Ver hoy → Visto auto-transition, applied inside
	// the same transaction as the save that watches the episode.
	return anime.WriteServiceDeps{
		Conflicts:      conflictService,
		Notifier:       a.notifier,
		Logger:         a.sharedLogger,
		OCCObserveOnly: true,
		SaveRule:       anime.NewSectionMoveRule(season.WatchedSection),
	}
}

// recoverStagedAnimeWrites replays any staged anime writes left by an interruption.
func (a *App) recoverStagedAnimeWrites(ctx context.Context) bool {
	if a.bridgeDB == nil || !a.animeWrite.RecoveryConfigured() {
		return true
	}
	if err := a.animeWrite.RecoverWrites(ctx); err != nil {
		// Fatal: staged writes left unrecovered mean the anime data is in an
		// indeterminate state, so nothing further may run against it.
		a.startupErr = fmt.Errorf("recover staged anime writes: %w", err)
		a.startupFatal = true
		return false
	}
	return true
}

// newMobileAnimeWriteService builds the mobile anime writer with activity recording.
func (a *App) newMobileAnimeWriteService() activityAnimeWriteService {
	return activityAnimeWriteService{
		query:         a.animeQuery,
		writer:        a.animeWrite,
		recorder:      activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB))},
		watchRecorder: watchRecorderAdapter{store: watchhistory.NewStore(a.bridgeDB)},
		logger:        a.sharedLogger,
		source:        anime.ActivitySourceMobile,
		now:           func() int64 { return time.Now().UnixMilli() },
	}
}
