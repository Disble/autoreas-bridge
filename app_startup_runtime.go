package main

import (
	"context"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/observability/mobilecapture"
	"autoreas-bridge/internal/schedule"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

type syncDeviceStateAdapter struct {
	store interface {
		ListDeviceSyncStates(ctx context.Context) ([]bridgeSync.DeviceSyncState, error)
		AcknowledgeDevice(ctx context.Context, deviceID string, lastAckChangelogID int64, lastSeenAtMs int64) error
		MarkDeviceRevoked(ctx context.Context, deviceID string, atMs int64) error
	}
}

func (a syncDeviceStateAdapter) ListDeviceSyncStates(ctx context.Context) ([]device.SyncState, error) {
	states, err := a.store.ListDeviceSyncStates(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]device.SyncState, 0, len(states))
	for _, state := range states {
		out = append(out, device.SyncState{
			DeviceID:               state.DeviceID,
			LastAckChangelogID:     state.LastAckChangelogID,
			LastSeenAtMs:           state.LastSeenAtMs,
			SyncStatus:             state.SyncStatus,
			BlocksChangelogPruning: state.BlocksChangelogPrune,
		})
	}
	return out, nil
}

func (a syncDeviceStateAdapter) MarkDeviceRevoked(ctx context.Context, deviceID string, atMs int64) error {
	return a.store.MarkDeviceRevoked(ctx, deviceID, atMs)
}

func (a syncDeviceStateAdapter) MarkDeviceActive(ctx context.Context, deviceID string, atMs int64) error {
	return a.store.AcknowledgeDevice(ctx, deviceID, 0, atMs)
}

// canUseBridgeDB reports whether the configured bridge database is reachable.
func (a *App) canUseBridgeDB(ctx context.Context) (ok bool) {
	if a.bridgeDB == nil {
		return false
	}
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	return a.bridgeDB.PingContext(ctx) == nil
}

// notifyDeviceSyncHealth reports device staleness and prunes acknowledged changes.
func (a *App) notifyDeviceSyncHealth(ctx context.Context, store interface {
	EvaluateDeviceStaleness(ctx context.Context, nowMs int64, staleAfterMs int64, warnBeforeStaleMs int64) ([]bridgeSync.DeviceSyncState, error)
	PruneAcknowledgedChangelog(ctx context.Context) (int64, error)
}) {
	if store == nil || a.notifier == nil {
		return
	}
	states, err := store.EvaluateDeviceStaleness(ctx, time.Now().UnixMilli(), bridgeSync.DeviceSyncStaleAfter.Milliseconds(), bridgeSync.DeviceSyncWarnBeforeStale.Milliseconds())
	if err != nil {
		if a.sharedLogger != nil {
			a.sharedLogger.Warnf("sync", "failed to evaluate device sync health: %v", err)
		}
		return
	}
	for _, state := range states {
		switch state.SyncStatus {
		case bridgeSync.DeviceSyncStatusWarning:
			_ = a.notifier.Notify(ctx, notification.Notification{
				Source:    "sync",
				Level:     notification.LevelWarning,
				Title:     "Device sync warning",
				Body:      "A paired device has not synced recently. If it does not reconnect soon, Bridge will stop preserving old sync changes for it.",
				Timestamp: time.Now(),
			})
		case bridgeSync.DeviceSyncStatusStale:
			_ = a.notifier.Notify(ctx, notification.Notification{
				Source:    "sync",
				Level:     notification.LevelWarning,
				Title:     "Device marked stale",
				Body:      "A paired device has been offline long enough that it no longer blocks changelog cleanup. It may need a full refresh when it reconnects.",
				Timestamp: time.Now(),
			})
		}
	}
	if _, err := store.PruneAcknowledgedChangelog(ctx); err != nil && a.sharedLogger != nil {
		a.sharedLogger.Warnf("sync", "failed to prune acknowledged changelog after device health evaluation: %v", err)
	}
}

// configureTray starts the tray manager and hides the main window.
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

// prepareAnimeRuntime initializes the anime writer and its startup context.
//
// SDD-55 Slice B (ADR-55-1/ADR-55-3): the file-append channel is deleted
// entirely (no `AppendLine` seam left to wire) -- persist() finalizes
// straight into SQLite. The writer still publishes committed anime.changed
// events on the shared event bus (PublishCommitted) for the SQLite outbox
// drain.
func (a *App) prepareAnimeRuntime(ctx context.Context) {
	catchUpContext, catchUpCancel := context.WithCancel(ctx)
	a.catchUpContext = catchUpContext
	a.catchUpCancel = catchUpCancel
	a.notifier = a.newNotifier(a.emitFn, a.sharedLogger)
	a.animeSelfEchoRegistry = a.newSelfEchoRegistry()
	a.animeUpdateWriter = a.newUpdateWriter(anime.UpdateWriterConfig{
		Bus:              a.eventBus,
		Publisher:        a.eventBus,
		Logger:           anime.NewStdLogger(),
		SharedLogger:     a.sharedLogger,
		SelfEchoRegistry: a.animeSelfEchoRegistry,
	})
	a.animeUpdateWriter.StartAsync(catchUpContext)
}

// buildHTTPServer creates the configured bridge HTTP server.
func (a *App) buildHTTPServer(deviceService device.AuthService, animeWrite contracts.AnimeWriteService, conflictService *bridgeSync.ConflictStore, statusService *bridgeSync.StatusService, syncTrigger *bridgeSync.TriggerService) api.Server {
	return a.newHTTPServer(api.Config{
		DeviceService:          deviceService,
		AnimeQuery:             a.animeQuery,
		AnimeWrite:             animeWrite,
		SyncTrigger:            syncTrigger,
		Status:                 statusService,
		DeviceAdmin:            deviceService.(device.AdminService),
		Conflicts:              conflictService,
		RecordSeasonRating:     a.recordSeasonRating(),
		ActiveSeasonSnapshot:   a.activeSeasonSnapshot(),
		RealtimeHub:            a.realtimeHub,
		Logger:                 a.sharedLogger,
		OnPairingTokenConsumed: a.onPairingTokenConsumed(),
		Capture:                a.capture,
	})
}

// capture enqueues one observability record when the capture queue is available.
func (a *App) capture(record mobilecapture.CaptureRecord) bool {
	if a.captureQueue == nil {
		return false
	}
	return a.captureQueue.TryEnqueue(record)
}

// onPairingTokenConsumed returns the callback emitted after device pairing.
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

// startDownloadOrchestration wires and starts download scheduling services.
func (a *App) startDownloadOrchestration(ctx context.Context) {
	if a.bridgeDB == nil {
		return
	}
	a.ensureDownloadStore()
	if a.downloadStore == nil {
		return
	}
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
		SeasonMode:   a.seasonModeReader(),
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

// ensureDownloadStore initializes the download store when database access exists.
func (a *App) ensureDownloadStore() {
	if a.downloadStore != nil || a.bridgeDB == nil {
		return
	}
	a.downloadStore = a.newDownloadStore(a.bridgeDB)
}

// downloadJDDeviceName reads the configured JDownloader device name.
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

// registerDownloadRuntimeEventBridge forwards download events to the frontend.
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
