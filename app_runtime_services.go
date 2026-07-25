package main

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"

	"github.com/google/uuid"
)

// configureRuntimeServices wires and starts the bridge runtime services.
func (a *App) configureRuntimeServices(ctx context.Context) {
	a.configureCaptureQueue()
	a.configureCaptureReader()
	a.prepareAnimeRuntime(ctx)
	a.startSyncChangelogRecorder()
	deviceService, changelogStore := a.configureBridgeDeviceServices(ctx)
	a.configureRealtimeHub(ctx)
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

// configureCaptureReader wires the in-process capture read path
// (ListCaptureTransactions/GetCaptureTransaction) once, over the app's own
// bridgeDB handle -- never a second SQLite connection (design.md "Read
// handle"). Guarded like configureCaptureQueue: nil-safe when bridgeDB is
// absent, and a no-op once a reader already exists.
func (a *App) configureCaptureReader() {
	if a.captureReader != nil || a.bridgeDB == nil || a.newCaptureReader == nil {
		return
	}
	a.captureReader = a.newCaptureReader(a.bridgeDB)
}

// startSyncChangelogRecorder starts recording sync events from the event bus.
func (a *App) startSyncChangelogRecorder() {
	a.syncChangelogRecorder = a.newChangelogRecorder(a.eventBus, a.newChangelogStore(a.bridgeDB), a.sharedLogger)
	a.syncChangelogRecorder.Start(a.catchUpContext)
}

// configureBridgeDeviceServices wires device authentication and changelog services.
func (a *App) configureBridgeDeviceServices(ctx context.Context) (device.AuthService, *bridgeSync.ChangelogStore) {
	deviceStore := a.newDeviceStore(a.bridgeDB)
	a.deviceStore = deviceStore
	a.seasonService = season.NewService(a.newSeasonStore(a.bridgeDB), time.Now, uuid.NewString, newJkanimeNameSearcher())
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
}

// configureAnimeApplicationServices constructs the anime application services.
func (a *App) configureAnimeApplicationServices() *bridgeSync.ConflictStore {
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)
	animeQuery := anime.NewQueryService(snapshotStore)
	a.animeQuery = animeQuery
	a.animeEditorQuery = anime.NewQueryService(snapshotStore)
	// cover.NewDefaultResolver never fails construction (a cache-root
	// resolution error degrades to a no-op cache internally), so this wiring
	// is nil-safe by design -- see internal/anime/cover/production.go.
	a.coverResolver = cover.NewDefaultResolver(0)
	conflictService := bridgeSync.NewConflictStore(a.bridgeDB)
	a.animeWrite = anime.NewWriteService(snapshotStore, a.animeUpdateWriter)
	a.animeEditorWrite = anime.NewEditorService(snapshotStore, a.animeUpdateWriter)
	a.animeEditorScheduleQuery = anime.NewScheduleQueryService(a.animeEditorQuery)
	a.animeEditorScheduleWrite = anime.NewScheduleService(a.animeEditorQuery, a.animeUpdateWriter)
	deps := a.newAnimeWriteDeps(conflictService)
	a.animeWrite.SetDeps(deps)
	a.animeEditorWrite.SetDeps(deps)
	a.animeEditorScheduleWrite.SetDeps(deps)
	create := anime.NewCreateService(a.animeWrite, nil)
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
	return anime.WriteServiceDeps{
		Conflicts:      conflictService,
		Notifier:       a.notifier,
		Logger:         a.sharedLogger,
		OCCObserveOnly: true,
	}
}

// recoverStagedAnimeWrites replays any staged anime writes left by an interruption.
func (a *App) recoverStagedAnimeWrites(ctx context.Context) bool {
	if a.bridgeDB == nil || !a.animeWrite.RecoveryConfigured() {
		return true
	}
	if err := a.animeWrite.RecoverWrites(ctx); err != nil {
		a.startupErr = fmt.Errorf("recover staged anime writes: %w", err)
		return false
	}
	return true
}

// newMobileAnimeWriteService builds the mobile anime writer with activity recording.
func (a *App) newMobileAnimeWriteService() activityAnimeWriteService {
	return activityAnimeWriteService{
		query:    a.animeQuery,
		writer:   a.animeWrite,
		recorder: activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB))},
		source:   anime.ActivitySourceMobile,
		now:      func() int64 { return time.Now().UnixMilli() },
	}
}
