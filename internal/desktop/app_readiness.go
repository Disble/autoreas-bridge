package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/modules"
	"autoreas-bridge/internal/observability/activityread"
	"autoreas-bridge/internal/observability/incident"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/telemetry"
	bridgeSync "autoreas-bridge/internal/sync"
)

// The modules the composition root registers, one per bounded context it wires
// (ADR-032 §1). Each becomes ready or failed at the startup step named in
// moduleWiringChecks; docs/architecture/contexts/desktop/overview.md lists them.
const (
	moduleBackup        lifecycle.ModuleID = "backup"
	moduleObservability lifecycle.ModuleID = "observability"
	moduleSync          lifecycle.ModuleID = "sync"
	moduleDevices       lifecycle.ModuleID = "devices"
	moduleSettings      lifecycle.ModuleID = "settings"
	moduleAnime         lifecycle.ModuleID = "anime"
	moduleEpisodes      lifecycle.ModuleID = "episodes"
	moduleAPI           lifecycle.ModuleID = "api"
	moduleSeason        lifecycle.ModuleID = "season"
	moduleDownloads     lifecycle.ModuleID = "downloads"
	moduleNotifications lifecycle.ModuleID = "notifications"
)

// registeredModules is every module, in the order startup wires them.
var registeredModules = []lifecycle.ModuleID{
	moduleBackup, moduleObservability, moduleSync, moduleDevices, moduleSettings, moduleAnime,
	moduleEpisodes, moduleAPI, moduleSeason, moduleDownloads, moduleNotifications,
}

// errNotWired is the reason of a module whose wiring step left its services nil.
var errNotWired = errors.New("was not wired")

// moduleWiringChecks says, per module, whether its services were wired: nil
// means ready, an error is the failure reason the frontend shows.
var moduleWiringChecks = map[lifecycle.ModuleID]func(*App) error{
	moduleBackup: func(a *App) error { return wiredUnless(a.bridgeDB == nil, "bridge database") },
	moduleObservability: func(a *App) error {
		return wiredUnless(a.eventQueue == nil || a.captureReader == nil || a.syncDiagReader == nil,
			"runtime event log, request capture reader or sync diagnostics reader")
	},
	moduleSync: func(a *App) error {
		return wiredUnless(a.syncChangelogRecorder == nil || a.syncTrigger == nil, "sync changelog recorder or sync trigger")
	},
	moduleDevices:  func(a *App) error { return wiredUnless(a.deviceStore == nil, "device store") },
	moduleSettings: func(a *App) error { return wiredUnless(a.settingsStore == nil, "settings store") },
	moduleAnime: func(a *App) error {
		return wiredUnless(a.animeQuery == nil || a.animeWrite == nil, "anime services")
	},
	moduleEpisodes: func(a *App) error { return wiredUnless(a.episodeService == nil, "episode service") },
	moduleAPI: func(a *App) error {
		// Past the database step, only the HTTP server sets startupErr.
		if a.startupErr != nil {
			return fmt.Errorf("HTTP server failed to start: %w", a.startupErr)
		}
		return wiredUnless(a.httpServer == nil, "HTTP server")
	},
	moduleSeason: func(a *App) error { return wiredUnless(a.seasonService == nil, "season service") },
	moduleDownloads: func(a *App) error {
		return wiredUnless(a.downloadService == nil || a.readinessService == nil, "download services")
	},
	moduleNotifications: func(a *App) error {
		return wiredUnless(a.notificationCenterExecutor == nil, "notification center")
	},
}

// wiredUnless returns the not-wired reason for what when missing is true.
func wiredUnless(missing bool, what string) error {
	if missing {
		return fmt.Errorf("%s %w", what, errNotWired)
	}
	return nil
}

// observabilityServices are the services the observability module's bindings use: the
// Activity reads, the pin store and the two capture-table readers. bindObservabilityModule binds
// them before configureRuntimeServices marks the module ready.
type observabilityServices struct {
	activity        *activityread.Reader
	pins            *incident.Store
	captures        *requestcapture.Reader
	syncDiagnostics *telemetry.Reader
}

// animeServices are the services the anime module's read bindings use: the anime
// query, the watch-history reader and the cover thumbnails. covers stays nil when
// the platform has no cache root; the cover bindings then answer the placeholder.
// bindAnimeModule binds them before configureRuntimeServices marks the module ready.
type animeServices struct {
	query        contracts.AnimeQueryService
	watchHistory watchHistoryReader
	covers       coverThumbnails
}

// episodeServices are the services the episodes module's migrated bindings use:
// the episode service and the bridge database the durations editor reads and
// writes. wireEpisodeServiceWithWriter binds them before configureRuntimeServices
// marks the module ready.
type episodeServices struct {
	episodes  episodeCommandService
	durations *sql.DB
}

// apiServices are the services the api module's bindings use. startHTTPServer
// binds them before configureRuntimeServices marks the module ready.
type apiServices struct {
	server api.Server
}

// syncServices are the services the sync module's bindings use. startHTTPServer
// binds them before configureRuntimeServices marks the module ready.
type syncServices struct {
	trigger *bridgeSync.TriggerService
}

// backupServices are the services the backup module's bindings use: the bridge
// database, which backup export and import read and the SQLite status pings.
// startup binds them as soon as the database opened, and marks the module ready
// right after, so a broken sync or anime wiring never takes restore away.
type backupServices struct {
	db *sql.DB
}

// deviceServices are the services the devices module's bindings use.
// bindDevicesModule binds them before configureRuntimeServices marks the module ready.
type deviceServices struct {
	store    device.Store
	admin    device.AdminService
	newToken func() (string, error)
}

// settingsServices are the services the settings module's bindings use: the
// settings store. bindSettingsModule binds them where startup wires the store,
// before configureRuntimeServices marks the module ready.
type settingsServices struct {
	store appSettingsStore
}

// appModules is the module set App holds: the readiness registry, its writer
// (only the composition root writes) and the module handles. Domain modules get
// their handle here when they migrate (ADR-032 §3; internal/modules says how).
type appModules struct {
	once          sync.Once
	registry      *lifecycle.Registry
	writer        *lifecycle.Writer
	shell         *modules.Shell
	backup        *modules.Handle[backupServices]
	anime         *modules.Handle[animeServices]
	episodes      *modules.Handle[episodeServices]
	api           *modules.Handle[apiServices]
	sync          *modules.Handle[syncServices]
	devices       *modules.Handle[deviceServices]
	settings      *modules.Handle[settingsServices]
	observability *modules.Handle[observabilityServices]
}

// moduleSet builds the module set once, on first use, and registers every module
// as starting. Wails may call GetReadiness before startup runs; that first call
// builds the set, so it already reads "starting". NewApp has set the event bus by
// then, and startup never replaces it, so the registry always publishes on it.
func (a *App) moduleSet() *appModules {
	a.modules.once.Do(func() {
		a.modules.registry, a.modules.writer = lifecycle.New(a.eventBus)
		a.modules.writer.Register(registeredModules...)
		a.modules.shell = modules.NewShell(a.shellServices())
		a.modules.backup = modules.NewHandle[backupServices](moduleBackup, a.modules.registry)
		a.modules.anime = modules.NewHandle[animeServices](moduleAnime, a.modules.registry)
		a.modules.episodes = modules.NewHandle[episodeServices](moduleEpisodes, a.modules.registry)
		a.modules.api = modules.NewHandle[apiServices](moduleAPI, a.modules.registry)
		a.modules.sync = modules.NewHandle[syncServices](moduleSync, a.modules.registry)
		a.modules.devices = modules.NewHandle[deviceServices](moduleDevices, a.modules.registry)
		a.modules.settings = modules.NewHandle[settingsServices](moduleSettings, a.modules.registry)
		a.modules.observability = modules.NewHandle[observabilityServices](moduleObservability, a.modules.registry)
	})
	return &a.modules
}

// shellServices collects the shell capabilities NewApp wires: the logger, the
// native pickers, the MyAnimeList client and the JDownloader limit reader. A nil
// one stays nil, and the binding that needs it answers internal.
func (a *App) shellServices() modules.ShellServices {
	services := modules.ShellServices{
		EffectiveAddress:           a.effectiveAddress,
		Readiness:                  a.modules.registry,
		PickFile:                   a.pickFile,
		PickFolder:                 a.pickFolder,
		JDMaxSimultaneousDownloads: jdMaxConcurrentAnimes,
	}
	if a.sharedLogger != nil {
		services.Logger = a.sharedLogger
	}
	if a.myanimelistClient != nil {
		services.MetadataLookup = a.myanimelistClient
	}
	return services
}

// settleModules marks each module ready when its services were wired and
// failed with the reason otherwise. A module already settled keeps its state.
func (a *App) settleModules(ids ...lifecycle.ModuleID) {
	writer := a.moduleSet().writer
	for _, id := range ids {
		if err := moduleWiringChecks[id](a); err != nil {
			_ = writer.MarkFailed(id, fmt.Sprintf("%s: %v", id, err))
			continue
		}
		_ = writer.MarkReady(id)
	}
}

// failStartingModules fails every module still starting with "<step>: <startupErr>":
// that startup step returned early, so their wiring will not run in this process.
func (a *App) failStartingModules(step string) {
	a.moduleSet().writer.FailStarting(fmt.Sprintf("%s: %v", step, a.startupErr))
}

// ModuleReadiness is one module's readiness as the frontend receives it, both in
// GetReadiness and in each bridge.readiness event. Reason is set only when failed.
type ModuleReadiness struct {
	Module string `json:"module"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
}

// ReadinessSnapshot is every module's readiness, in registration order.
type ReadinessSnapshot struct {
	Modules []ModuleReadiness `json:"modules"`
}

// toModuleReadiness maps one lifecycle status to its DTO.
func toModuleReadiness(status lifecycle.Status) ModuleReadiness {
	return ModuleReadiness{Module: string(status.Module), State: string(status.State), Reason: status.Reason}
}

// GetReadiness returns every module's readiness (ADR-032 §1). The frontend
// subscribes to bridge.readiness first and then calls this, so a transition
// emitted before its listener existed is not lost.
func (a *App) GetReadiness() (ReadinessSnapshot, error) {
	return a.moduleSet().shell.Use(func(services modules.ShellServices) (ReadinessSnapshot, error) {
		statuses := services.Readiness.Snapshot()
		snapshot := ReadinessSnapshot{Modules: make([]ModuleReadiness, 0, len(statuses))}
		for _, status := range statuses {
			snapshot.Modules = append(snapshot.Modules, toModuleReadiness(status))
		}
		return snapshot, nil
	})
}

// registerReadinessRuntimeEventBridge forwards every readiness transition to the
// frontend as bridge.readiness, like the other register*RuntimeEventBridge
// functions: a mapped DTO, never the bus event itself. It builds the module set
// first, so the registrations it publishes are not forwarded: the frontend reads
// the starting state through GetReadiness.
func (a *App) registerReadinessRuntimeEventBridge(ctx context.Context) {
	a.moduleSet()
	if a.eventBus == nil || a.emitFn == nil {
		return
	}
	a.eventBus.Subscribe(lifecycle.EventNameReadinessChanged, func(event events.Event) {
		changed, ok := event.(lifecycle.ReadinessChangedEvent)
		if !ok {
			return
		}
		emitCtx := a.ctx
		if emitCtx == nil {
			emitCtx = ctx
		}
		if emitCtx == nil {
			return
		}
		a.emitFn(emitCtx, lifecycle.EventNameReadinessChanged, toModuleReadiness(changed.Status))
	})
}

// bindingFailure is the JSON a coded binding failure travels as.
type bindingFailure struct {
	Code    apperr.Code `json:"code"`
	Message string      `json:"message"`
}

// formatBindingError is the Wails ErrorFormatter. Wails turns any object into
// "[object Object]" in JS, so a coded failure travels as a JSON string
// {"code":…,"message":…}. Every other error keeps its plain message, exactly as
// Wails sends it without a formatter, so legacy bindings keep their messages
// until their module migrates (ADR-032 §2).
func formatBindingError(err error) any {
	code, ok := apperr.CodeOf(err)
	if !ok {
		return err.Error()
	}
	encoded, _ := json.Marshal(bindingFailure{Code: code, Message: err.Error()})
	return string(encoded)
}
