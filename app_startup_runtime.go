package main

import (
	"context"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/schedule"
	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/notification"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

func (a *App) configureTray(ctx context.Context) bool {
	a.trayManager = a.newTrayManager()
	if a.trayManager == nil {
		return true
	}
	a.startupErr = a.trayManager.Start(tray.Config{
		Icon:    tray.DefaultIcon,
		Tooltip: tray.DefaultTooltip,
		OnOpen:  a.openMainWindow,
		OnExit:  a.requestQuit,
	})
	if a.startupErr != nil {
		return false
	}
	a.hideWindow(ctx)
	return true
}

func (a *App) startAnimeRuntime(ctx context.Context, animeDataPath string) {
	catchUpContext, catchUpCancel := context.WithCancel(ctx)
	a.catchUpContext = catchUpContext
	a.catchUpCancel = catchUpCancel
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
	a.animeLegacyPull = a.newLegacyPullService(anime.LegacyPullServiceConfig{
		FilePath:     animeDataPath,
		Parser:       a.newSnapshotParser(),
		Store:        a.newSnapshotStore(a.bridgeDB),
		Publisher:    a.eventBus,
		Logger:       anime.NewStdLogger(),
		SharedLogger: a.sharedLogger,
	})
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
}

func (a *App) buildHTTPServer(deviceService device.AuthService, animeWrite *anime.WriteService, conflictService *bridgeSync.ConflictStore, statusService *bridgeSync.StatusService, syncTrigger *bridgeSync.TriggerService) api.Server {
	return a.newHTTPServer(api.Config{
		DeviceService:          deviceService,
		AnimeQuery:             a.animeQuery,
		AnimeWrite:             animeWrite,
		SyncTrigger:            syncTrigger,
		Status:                 statusService,
		DeviceAdmin:            deviceService.(device.AdminService),
		Conflicts:              conflictService,
		RealtimeHub:            a.realtimeHub,
		Logger:                 a.sharedLogger,
		OnPairingTokenConsumed: a.onPairingTokenConsumed(),
	})
}

func (a *App) onPairingTokenConsumed() func() {
	return func() {
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
	}
}

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
		Run: func(runCtx context.Context, trigger string) (string, error) {
			if a.downloadService == nil {
				return "", nil
			}
			result, err := a.downloadService.RunOnce(runCtx, trigger)
			return result.Status, err
		},
		Log: a.sharedLogger,
	})
	a.downloadScheduler.Start(ctx)
}

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

func (a *App) registerDownloadRuntimeEventBridge(ctx context.Context) {
	if a.eventBus == nil || a.emitFn == nil {
		return
	}
	for _, eventName := range downloadRuntimeEventNames {
		eventName := eventName
		a.eventBus.Subscribe(eventName, func(event events.Event) {
			emitCtx := a.ctx
			if emitCtx == nil {
				emitCtx = ctx
			}
			if emitCtx == nil || a.emitFn == nil {
				return
			}
			a.emitFn(emitCtx, event.Name(), event)
		})
	}
}
