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
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/schedule"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

type syncDeviceStateAdapter struct {
	store interface {
		ListDeviceSyncStates(ctx context.Context) ([]bridgeSync.DeviceSyncState, error)
		AcknowledgeDevice(ctx context.Context, deviceID string, lastAckChangelogID, lastSeenAtMs int64) error
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

// openDevicesActions returns the whole-notification token every device notice carries.
//
// Both producers that use it -- the two sync-health branches and the pairing success -- are about
// one paired device and none of them individuate anything, so there is nothing for a row-level
// verb to bind to. The success case gets one too: a notification with nowhere to go is a dead
// end, whichever way it went.
func openDevicesActions() []notification.ActionSpec {
	return []notification.ActionSpec{{
		Label:  openDevicesActionLabel,
		Intent: center.IntentNavigationOpen,
		Args:   map[string]string{center.ArgKeyRoute: devicesRoute},
	}}
}

// notifyDeviceSyncHealth reports device staleness and prunes acknowledged changes.
func (a *App) notifyDeviceSyncHealth(ctx context.Context, store interface {
	EvaluateDeviceStaleness(ctx context.Context, nowMs, staleAfterMs, warnBeforeStaleMs int64) ([]bridgeSync.DeviceSyncState, error)
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
				Kind:      syncHealthWarningKind,
				Timestamp: time.Now(),
				Actions:   openDevicesActions(),
			})
		case bridgeSync.DeviceSyncStatusStale:
			_ = a.notifier.Notify(ctx, notification.Notification{
				Source:    "sync",
				Level:     notification.LevelWarning,
				Title:     "Device marked stale",
				Body:      "A paired device has been offline long enough that it no longer blocks changelog cleanup. It may need a full refresh when it reconnects.",
				Kind:      syncHealthWarningKind,
				Timestamp: time.Now(),
				Actions:   openDevicesActions(),
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
	if a.canUseBridgeDB(ctx) {
		a.notificationCenterStore = center.NewStore(a.bridgeDB, center.StoreConfig{})
		a.notifier = center.Wrap(a.notifier, a.notificationCenterStore)
	}
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
func (a *App) buildHTTPServer(deviceService device.AuthService, animeWrite contracts.AnimePatcher, conflictService *bridgeSync.ConflictStore, statusService *bridgeSync.StatusService, syncTrigger *bridgeSync.TriggerService) api.Server {
	return a.newHTTPServer(api.Config{
		Addr:                   a.resolveAPIAddr(),
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
		PersistTerminal:        a.persistCaptureTerminal,
	})
}

// capture enqueues one observability record when the capture queue is available.
func (a *App) capture(record requestcapture.CaptureRecord) bool {
	if a.captureQueue == nil {
		return false
	}
	return a.captureQueue.TryEnqueue(record)
}

// persistCaptureTerminal repairs an accepted-arrival / dropped-terminal split
// by upserting the terminal row directly through a short, finite store write.
func (a *App) persistCaptureTerminal(record requestcapture.CaptureRecord) {
	if a.captureStore == nil {
		if a.bridgeDB == nil || a.newCaptureStore == nil {
			return
		}
		a.captureStore = a.newCaptureStore(a.bridgeDB)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	if err := a.captureStore.UpsertCapture(ctx, record); err != nil && a.sharedLogger != nil {
		a.sharedLogger.Warnf("api", "failed terminal capture recovery for %s: %v", record.RequestID, err)
	}
}

// captureTransactionEventName is the Wails runtime event streaming each
// persisted capture row to the frontend Network/Activity view in real time
// (design.md "Emit choke point"), mirroring the committed
// download-runtime-source event bridge.
const captureTransactionEventName = "capture.transaction"

// emitCaptureTransaction streams one persisted capture row to the frontend
// over the Wails runtime event bus. Wired as requestcapture.QueueConfig.OnPersist:
// it fires exactly once per record, from the queue's single serialized drain
// goroutine, only after Store.UpsertCapture has actually persisted it -- the
// one choke point where emitting "what actually persisted" is guaranteed.
// Nil-safe before ctx/emitFn are wired (e.g. during startup or in tests that
// never call a.startup).
func (a *App) emitCaptureTransaction(record requestcapture.CaptureRecord) {
	if a.ctx == nil || a.emitFn == nil {
		return
	}
	a.emitFn(a.ctx, captureTransactionEventName, toCaptureRow(record))
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
				Kind:      devicePairedKind,
				Timestamp: time.Now(),
				Actions:   openDevicesActions(),
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
		Animes:        a.animeQuery,
		Sites:         registry,
		DownloadsRoot: a.downloadsRoot,
		Hosters:       hosterResolver,
		JD:            newReconfigurableJDClient(a.downloadStore),
		Counter:       filesystem.NewEpisodeCounter(),
		Flattener:     filesystem.NewFlattener(),
		Renamer:       filesystem.NewRenamer(),
		// Read JD's own "Max. simultaneous Downloads" per run rather than once at startup,
		// so changing it in JDownloader takes effect without restarting Bridge.
		MaxConcurrentAnimes: jdMaxConcurrentAnimes,
		Store:               a.downloadStore,
		Notifier:            a.notifier,
		Bus:                 a.eventBus,
		Logger:              a.sharedLogger,
		JDDeviceName:        a.downloadJDDeviceName(ctx),
		SeasonMode:          a.seasonModeReader(),
		// Read per episode rather than captured here, so toggling the setting takes
		// effect on the next download instead of the next Bridge restart.
		RenameEpisodes: a.episodeRenameEnabled,
		// A method value, not a.readinessService.BuildSnapshot: the readiness service is
		// constructed a few lines BELOW this call, so binding the method directly would
		// capture a nil receiver forever. Going through the App resolves the field on the
		// call instead of on the wiring.
		Readiness: a.downloadReadinessSnapshot,
	})
	a.readinessService = download.NewReadinessService(download.ReadinessServiceDeps{
		Animes:        a.animeQuery,
		DownloadsRoot: a.downloadsRoot,
		Sites:         registry,
		Clock:         time.Now,
		SeasonMode:    a.seasonModeReader(),
	})
	if _, err := a.downloadStore.ReconcileInterruptedRuns(ctx, time.Now().UnixMilli()); err != nil && a.sharedLogger != nil {
		a.sharedLogger.Warnf("download", "failed to reconcile interrupted download runs at startup: %v", err)
	}
	a.downloadScheduler = a.newDownloadScheduler(schedule.Deps{
		Store:            a.downloadStore,
		Clock:            schedule.NewRealClock(),
		ProcessStartedAt: a.processStartedAt,
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

// registerAnimeRuntimeEventBridge forwards committed anime changes to the
// desktop frontend so panels react to writes that did not originate in this
// window (mobile, REST API, background download progress). The realtime hub
// already fans the same event out to mobile clients; this is the desktop leg.
func (a *App) registerAnimeRuntimeEventBridge(ctx context.Context) {
	if a.eventBus == nil || a.emitFn == nil {
		return
	}
	a.eventBus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		emitCtx := a.ctx
		if emitCtx == nil {
			emitCtx = ctx
		}
		if emitCtx == nil || a.emitFn == nil {
			return
		}
		a.emitFn(emitCtx, events.EventNameAnimeChanged, contracts.AnimeChangedNotice{
			AnimeID:       changed.AnimeID,
			ChangeType:    changed.ChangeType,
			ChangedFields: changed.ChangedFields,
			CorrelationID: changed.CorrelationID,
		})
	})
}

// registerDownloadRuntimeEventBridge forwards download events to the frontend.
func (a *App) registerDownloadRuntimeEventBridge(ctx context.Context) {
	if a.eventBus == nil || a.emitFn == nil {
		return
	}
	for _, eventName := range downloadRuntimeEventNames {
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
