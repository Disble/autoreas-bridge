package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/autostart"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/realtime"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
	"autoreas-bridge/internal/tray"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// defaultObservabilityEmit forwards an observability event to the Wails runtime.
func defaultObservabilityEmit(ctx context.Context, eventName string, optionalData ...any) {
	if ctx == nil || ctx == context.Background() || ctx == context.TODO() {
		return
	}
	wruntime.EventsEmit(ctx, eventName, optionalData...)
}

// defaultNotifier builds the default notification dispatcher and adapters.
func defaultNotifier(emit func(ctx context.Context, eventName string, optionalData ...any), loggers ...sharedlogger.Logger) notification.Notifier {
	adapters := []notification.Adapter{
		notification.NewUIToastAdapter(emit),
		notification.NewDesktopToastAdapter(),
	}
	if len(loggers) > 0 && loggers[0] != nil {
		adapters = append(adapters, notification.NewLogForwardAdapter(loggers[0]))
	}
	return notification.NewDispatcher(adapters...)
}

// defaultPairingTokenGenerator creates a cryptographically random pairing token.
func defaultPairingTokenGenerator() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// ensureRuntimeDependencies initializes all runtime dependency groups.
func (a *App) ensureRuntimeDependencies() {
	a.ensureAnimeRuntimeDependencies()
	a.ensureSyncRuntimeDependencies()
	a.ensureDesktopRuntimeDependencies()
	a.ensureDownloadRuntimeDependencies()
}

// ensureAnimeRuntimeDependencies fills missing anime runtime dependencies.
func (a *App) ensureAnimeRuntimeDependencies() {
	if a.bootstrapBridgeDB == nil {
		a.bootstrapBridgeDB = bridgeSync.BootstrapBridgeDB
	}
	if a.newSelfEchoRegistry == nil {
		a.newSelfEchoRegistry = anime.NewSelfEchoRegistry
	}
	if a.newUpdateWriter == nil {
		a.newUpdateWriter = func(config anime.UpdateWriterConfig) anime.UpdateWriter {
			return anime.NewUpdateWriter(config)
		}
	}
}

// ensureSyncRuntimeDependencies fills missing sync runtime dependencies.
func (a *App) ensureSyncRuntimeDependencies() {
	if a.newChangelogStore == nil {
		a.newChangelogStore = func(db *sql.DB) changelogPendingStore {
			return bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))
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
		a.newNotifier = func(emit func(ctx context.Context, eventName string, optionalData ...any), loggers ...sharedlogger.Logger) notification.Notifier {
			return defaultNotifier(emit, loggers...)
		}
	}
	if a.newRealtimeHub == nil {
		a.newRealtimeHub = func(ctx context.Context) realtime.Hub {
			return realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{Logger: a.sharedLogger, Capture: a.capture})
		}
	}
	if a.newHTTPServer == nil {
		a.newHTTPServer = func(config api.Config) api.Server {
			return api.NewServer(config)
		}
	}
	a.ensureCaptureRuntimeDependencies()
	if a.newTrayManager == nil {
		a.newTrayManager = func() tray.Manager {
			return nil
		}
	}
	if a.newAutoStartReconciler == nil {
		a.newAutoStartReconciler = func() autoStartReconciler {
			return autostart.NewSystemReconciler()
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
}

// ensureCaptureRuntimeDependencies fills the request-capture runtime seams used
// by the queue/reader/fallback store wiring.
func (a *App) ensureCaptureRuntimeDependencies() {
	if a.newCaptureStore == nil {
		a.newCaptureStore = func(db *sql.DB) requestcapture.Store {
			return requestcapture.NewStore(db, requestcapture.StoreConfig{})
		}
	}
	if a.newCaptureQueue == nil {
		a.newCaptureQueue = func(db *sql.DB) captureQueue {
			return requestcapture.NewQueue(a.newCaptureStore(db), requestcapture.QueueConfig{OnPersist: a.emitCaptureTransaction})
		}
	}
	if a.newCaptureReader == nil {
		a.newCaptureReader = requestcapture.NewReader
	}
}

// ensureDownloadRuntimeDependencies fills missing download runtime dependencies.
func (a *App) ensureDownloadRuntimeDependencies() {
	if a.newDownloadStore == nil {
		a.newDownloadStore = func(db *sql.DB) download.Store {
			return download.NewSQLiteStore(db)
		}
	}
	if a.newSeasonStore == nil {
		a.newSeasonStore = func(db *sql.DB) season.Repository {
			return season.NewSQLiteStore(db)
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
}

// ensureDesktopRuntimeDependencies fills missing desktop runtime dependencies.
func (a *App) ensureDesktopRuntimeDependencies() {
	a.ensureRuntimeFunctions()
	a.ensureRuntimeObservability()
}

// ensureRuntimeFunctions fills missing Wails runtime function hooks.
func (a *App) ensureRuntimeFunctions() {
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
		a.openFolder = openFolderInFileManager
	}
	if a.pickFolder == nil {
		a.pickFolder = func(ctx context.Context, title string) (string, error) {
			return wruntime.OpenDirectoryDialog(ctx, wruntime.OpenDialogOptions{Title: title})
		}
	}
	if a.pickFile == nil {
		a.pickFile = func(ctx context.Context, title string) (string, error) {
			return wruntime.OpenFileDialog(ctx, wruntime.OpenDialogOptions{
				Title:   title,
				Filters: []wruntime.FileFilter{{DisplayName: "Images (*.jpg;*.jpeg;*.png;*.webp;*.gif)", Pattern: "*.jpg;*.jpeg;*.png;*.webp;*.gif"}},
			})
		}
	}
	if a.saveFile == nil {
		a.saveFile = func(ctx context.Context, title, defaultFilename string) (string, error) {
			return wruntime.SaveFileDialog(ctx, wruntime.SaveDialogOptions{
				Title:           title,
				DefaultFilename: defaultFilename,
				Filters:         []wruntime.FileFilter{{DisplayName: "Backup bundle (*.zip)", Pattern: "*.zip"}},
			})
		}
	}
	if a.pickBundle == nil {
		// a.pickFile is hard-wired to an image filter for the anime cover
		// picker; widening it would change that unrelated dialog, so import
		// gets its own seam with a Backup bundle (*.zip) filter instead.
		a.pickBundle = func(ctx context.Context, title string) (string, error) {
			return wruntime.OpenFileDialog(ctx, wruntime.OpenDialogOptions{
				Title:   title,
				Filters: []wruntime.FileFilter{{DisplayName: "Backup bundle (*.zip)", Pattern: "*.zip"}},
			})
		}
	}
	if a.resolveBridgeDBPath == nil {
		a.resolveBridgeDBPath = bridgeSync.ResolveExistingBridgeDBPath
	}
}

// ensureRuntimeObservability initializes the shared logging and event bus services.
func (a *App) ensureRuntimeObservability() {
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
	if a.eventSink == nil {
		a.eventSink = eventlog.NewSink(eventlog.SinkConfig{})
	}
	if a.sharedLogger == nil {
		// The one NewFanoutLogger call site that changes: the event sink is
		// registered as a fourth fan-out target, constructed here (before
		// bridgeDB exists) with its queue nil -- WriteEntry drops and counts
		// via Sink.UnboundDrops() until configureEventLogQueue binds the
		// queue after bootstrap. This is the accepted early-boot gap.
		a.sharedLogger = sharedlogger.NewFanoutLoggerWithSinks(
			[]sharedlogger.Logger{sharedlogger.NewStdoutLogger(nil), a.memLogger},
			a.eventSink,
		)
	}
	if a.eventBus == nil {
		a.eventBus = events.NewInstrumentedBus(events.NewBus(), a.sharedLogger)
	}
	if a.newEventQueue == nil {
		a.newEventQueue = func(db *sql.DB) eventLogQueue {
			return eventlog.NewQueue(eventlog.NewStore(db, eventlog.EventStoreConfig{}), eventlog.QueueConfig{})
		}
	}
	if a.newEventReader == nil {
		a.newEventReader = eventlog.NewReader
	}
}

// openFolderInFileManager opens path in the operating system's file manager.
//
// The binary is resolved absolutely rather than from PATH (SonarQube
// go:S4036, CWE-426). This runs inside a shipped desktop application, not a
// build script: anything earlier on the user's PATH called explorer.exe would
// otherwise run in its place the first time somebody opens an anime folder.
// %SystemRoot% is set by Windows itself and its directory is not
// user-writable, so joining against it removes the lookup entirely.
//
// The fallback to a bare "explorer" keeps the previous behaviour when
// SystemRoot is unset, which is every non-Windows build. Those cannot open a
// folder today either way -- there is no xdg-open or open branch here -- and
// giving them one is a feature, not part of closing this finding.
func openFolderInFileManager(path string) error {
	explorer := "explorer"
	if systemRoot := os.Getenv("SystemRoot"); systemRoot != "" {
		explorer = filepath.Join(systemRoot, "explorer.exe")
	}
	return exec.Command(explorer, path).Start()
}
