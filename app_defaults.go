package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os/exec"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
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
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func defaultObservabilityEmit(ctx context.Context, eventName string, optionalData ...interface{}) {
	if ctx == nil || ctx == context.Background() || ctx == context.TODO() {
		return
	}
	wruntime.EventsEmit(ctx, eventName, optionalData...)
}

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

func defaultPairingTokenGenerator() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (a *App) ensureRuntimeDependencies() {
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
	if a.newLegacyPullService == nil {
		a.newLegacyPullService = anime.NewLegacyPullService
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
		a.newTrayManager = func() tray.TrayManager {
			return nil
		}
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
	if a.newPreferencesStore == nil {
		a.newPreferencesStore = func(db *sql.DB) preferences.Store {
			return preferences.NewSQLiteStore(db)
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
	if a.emitFn == nil {
		a.emitFn = defaultObservabilityEmit
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
	if a.openURL == nil {
		a.openURL = wruntime.BrowserOpenURL
	}
	if a.copyText == nil {
		a.copyText = wruntime.ClipboardSetText
	}
	if a.openFolder == nil {
		a.openFolder = func(path string) error {
			return exec.Command("explorer", path).Start()
		}
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
}
