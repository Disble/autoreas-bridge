package desktop

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/telemetry"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

// readinessEmits records every bridge.readiness payload startup forwards to the frontend.
type readinessEmits struct {
	mu       sync.Mutex
	payloads []ModuleReadiness
}

// emit is the App emitFn seam; it keeps only readiness events.
func (r *readinessEmits) emit(_ context.Context, eventName string, data ...any) {
	if eventName != "bridge.readiness" || len(data) != 1 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.payloads = append(r.payloads, data[0].(ModuleReadiness))
}

// allModules builds the expected snapshot: every module in registration order with one state.
func allModules(state, reason string) []ModuleReadiness {
	snapshot := make([]ModuleReadiness, 0, len(registeredModules))
	for _, id := range registeredModules {
		snapshot = append(snapshot, ModuleReadiness{Module: string(id), State: state, Reason: reason})
	}
	return snapshot
}

// readinessOf returns the snapshot GetReadiness answers, failing the test on an error.
func readinessOf(t *testing.T, app *App) []ModuleReadiness {
	t.Helper()
	snapshot, err := app.GetReadiness()
	if err != nil {
		t.Fatalf("GetReadiness() error = %v", err)
	}
	return snapshot.Modules
}

// TestRegisteredModulesMatchTheSharedJSON pins registeredModules to
// internal/lifecycle/modules.json, which the frontend ModuleId parity test reads too.
func TestRegisteredModulesMatchTheSharedJSON(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile(filepath.Join("..", "lifecycle", "modules.json"))
	if err != nil {
		t.Fatalf("read modules.json: %v", err)
	}
	var document struct {
		Modules []lifecycle.ModuleID `json:"modules"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatalf("decode modules.json: %v", err)
	}
	if !slices.Equal(registeredModules, document.Modules) {
		t.Fatalf("registeredModules = %v, modules.json = %v", registeredModules, document.Modules)
	}
}

func TestGetReadinessBeforeStartupReportsEveryModuleStarting(t *testing.T) {
	t.Parallel()

	got := readinessOf(t, newAppTestApp(t))

	if want := allModules("starting", ""); !slices.Equal(got, want) {
		t.Fatalf("GetReadiness() = %v, want %v", got, want)
	}
}

func TestStartupEarlyReturnFailsEveryModule(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		breakStep func(*App)
		reason    string
	}{
		{
			name: "tray failure",
			breakStep: func(a *App) {
				a.newTrayManager = func() tray.Manager { return &tray.MockTrayManager{StartErr: errors.New("no shell")} }
			},
			reason: "system tray failed to start: no shell",
		},
		{
			name: "database failure",
			breakStep: func(a *App) {
				a.bootstrapBridgeDB = func() (*sql.DB, error) { return nil, errors.New("database is locked") }
			},
			reason: "bridge database failed to open: database is locked",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := newAppTestApp(t)
			emits := &readinessEmits{}
			app.emitFn = emits.emit
			tc.breakStep(app)

			app.startup(context.Background())

			want := allModules("failed", tc.reason)
			if got := readinessOf(t, app); !slices.Equal(got, want) {
				t.Fatalf("GetReadiness() = %v, want %v", got, want)
			}
			if !slices.Equal(emits.payloads, want) {
				t.Fatalf("bridge.readiness payloads = %v, want %v", emits.payloads, want)
			}
		})
	}
}

// TestStartupSettlesEveryModule runs the real startup over a real database with a
// lost port race: every module leaves starting, the HTTP server fails with the
// bind error, and the local modules are ready despite it.
func TestStartupSettlesEveryModule(t *testing.T) {
	// Not parallel: a real startup registers the process-wide toast activation callback
	// (internal/notification), which other parallel startups would write concurrently.

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	app.newDownloadStore = nil
	app.newCaptureReader = nil
	app.newHTTPServer = func(api.Config) api.Server {
		return &stubAppHTTPServer{startErr: errors.New("bind: address already in use")}
	}
	emits := &readinessEmits{}
	app.emitFn = emits.emit
	t.Cleanup(func() { app.shutdown(context.Background()) })

	app.startup(context.Background())

	want := allModules("ready", "")
	want[slices.Index(registeredModules, moduleAPI)] = ModuleReadiness{
		Module: "api", State: "failed", Reason: "api: HTTP server failed to start: bind: address already in use",
	}
	if got := readinessOf(t, app); !slices.Equal(got, want) {
		t.Fatalf("GetReadiness() = %v, want %v", got, want)
	}
	if !slices.Equal(emits.payloads, want) {
		t.Fatalf("bridge.readiness payloads = %v, want the transitions in wiring order %v", emits.payloads, want)
	}
}

// observabilityNotWired is the failure reason of an observability module missing any reader.
const observabilityNotWired = "observability: runtime event log, request capture reader or sync diagnostics reader was not wired"

func TestSettleModulesNamesWhatWasNotWired(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		prune  func(*App)
		reason string
	}{
		{"backup", func(a *App) { a.bridgeDB = nil }, "backup: bridge database was not wired"},
		{"observability event log", func(a *App) { a.eventQueue = nil }, observabilityNotWired},
		{"observability capture reader", func(a *App) { a.captureReader = nil }, observabilityNotWired},
		{"observability sync diagnostics reader", func(a *App) { a.syncDiagReader = nil }, observabilityNotWired},
		{"sync changelog recorder", func(a *App) { a.syncChangelogRecorder = nil }, "sync: sync changelog recorder or sync trigger was not wired"},
		{"sync trigger", func(a *App) { a.syncTrigger = nil }, "sync: sync changelog recorder or sync trigger was not wired"},
		{"devices", func(a *App) { a.deviceStore = nil }, "devices: device store was not wired"},
		{"settings", func(a *App) { a.settingsStore = nil }, "settings: settings store was not wired"},
		{"anime query", func(a *App) { a.animeQuery = nil }, "anime: anime services was not wired"},
		{"anime write", func(a *App) { a.animeWrite = nil }, "anime: anime services was not wired"},
		{"anime editor query", func(a *App) { a.animeEditorQuery = nil }, "anime: anime services was not wired"},
		{"anime editor write", func(a *App) { a.animeEditorWrite = nil }, "anime: anime services was not wired"},
		{"anime schedule query", func(a *App) { a.animeEditorScheduleQuery = nil }, "anime: anime services was not wired"},
		{"anime schedule write", func(a *App) { a.animeEditorScheduleWrite = nil }, "anime: anime services was not wired"},
		{"anime batch create", func(a *App) { a.animeCreateBatch = nil }, "anime: anime services was not wired"},
		{"episodes", func(a *App) { a.episodeService = nil }, "episodes: episode service was not wired"},
		{"api", func(a *App) { a.httpServer = nil }, "api: HTTP server was not wired"},
		{"season", func(a *App) { a.seasonService = nil }, "season: season service was not wired"},
		{"downloads service", func(a *App) { a.downloadService = nil }, "downloads: download services was not wired"},
		{"downloads readiness", func(a *App) { a.readinessService = nil }, "downloads: download services was not wired"},
		{"downloads store", func(a *App) { a.downloadStore = nil }, "downloads: download services was not wired"},
		{"downloads scheduler", func(a *App) { a.downloadScheduler = nil }, "downloads: download services was not wired"},
		{"notifications", func(a *App) { a.notificationCenterExecutor = nil }, "notifications: notification center was not wired"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := wiredApp()
			tc.prune(app)

			app.settleModules(registeredModules...)

			snapshot := readinessOf(t, app)
			failed := modulesInState(snapshot, "failed")
			if len(failed) != 1 || failed[0].Reason != tc.reason {
				t.Fatalf("failed modules = %v, want one with reason %q", failed, tc.reason)
			}
			if ready := modulesInState(snapshot, "ready"); len(ready) != len(registeredModules)-1 {
				t.Fatalf("ready modules = %v, want every other module settled ready", ready)
			}
		})
	}
}

// wiredApp returns an App whose every module check passes, with all modules starting. It is a
// literal rather than a real startup: startup leaves background goroutines (schedulers, the
// toast activation callback) that would race with a test pruning the fields they read.
func wiredApp() *App {
	return &App{
		bridgeDB:                   &sql.DB{},
		eventQueue:                 &stubEventLogQueue{},
		captureReader:              &requestcapture.Reader{},
		syncDiagReader:             &telemetry.Reader{},
		syncChangelogRecorder:      &stubAppChangelogRecorder{},
		syncTrigger:                &bridgeSync.TriggerService{},
		deviceStore:                &stubAppDeviceStore{},
		settingsStore:              settings.NewSQLiteStore(nil),
		animeQuery:                 &stubAnimeQueryService{},
		animeWrite:                 &anime.WriteService{},
		animeEditorQuery:           &anime.QueryService{},
		animeEditorWrite:           &anime.EditorService{},
		animeEditorScheduleQuery:   &anime.ScheduleQueryService{},
		animeEditorScheduleWrite:   &anime.ScheduleService{},
		animeCreateBatch:           &anime.CreateService{},
		episodeService:             &stubAppEpisodeService{},
		httpServer:                 &stubAppHTTPServer{},
		seasonService:              &season.Service{},
		downloadService:            &download.Service{},
		readinessService:           &download.ReadinessService{},
		downloadStore:              &fakeAppDownloadStore{},
		downloadScheduler:          &fakeAppScheduler{},
		notificationCenterExecutor: &center.Executor{},
	}
}

// modulesInState keeps the entries of a snapshot in one state.
func modulesInState(snapshot []ModuleReadiness, state string) []ModuleReadiness {
	var kept []ModuleReadiness
	for _, module := range snapshot {
		if module.State == state {
			kept = append(kept, module)
		}
	}
	return kept
}

// TestReadinessBridgeSkipsMissingSeams proves the bridge neither subscribes to a missing bus nor
// calls a missing emitter: either would panic on the next transition.
func TestReadinessBridgeSkipsMissingSeams(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		prepare func(*App, *readinessEmits)
	}{
		{"no event bus", func(a *App, emits *readinessEmits) { a.emitFn = emits.emit }},
		{"no emitter", func(a *App, _ *readinessEmits) { a.ensureRuntimeDependencies(); a.emitFn = nil }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := newAppTestApp(t)
			emits := &readinessEmits{}
			tc.prepare(app, emits)

			app.registerReadinessRuntimeEventBridge(context.Background())
			app.failStartingModules("stopped")

			if len(emits.payloads) != 0 {
				t.Fatalf("emitted %v, want nothing", emits.payloads)
			}
		})
	}
}

func TestReadinessBridgeNeedsAContext(t *testing.T) {
	t.Parallel()
	app := newAppTestApp(t)
	emits := &readinessEmits{}
	app.emitFn = emits.emit
	app.ensureRuntimeDependencies()
	app.registerReadinessRuntimeEventBridge(nil) //nolint:staticcheck // SA1012: the nil context is the case under test.

	app.failStartingModules("stopped")

	if len(emits.payloads) != 0 {
		t.Fatalf("emitted %v without a context, want nothing", emits.payloads)
	}
}

func TestFormatBindingError(t *testing.T) {
	t.Parallel()

	formatter := buildAppOptions(newAppTestApp(t), embed.FS{}).ErrorFormatter
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"wrapped coded failure keeps its code", fmt.Errorf("load: %w", apperr.InvalidArgument("day must be 0-6")), `{"code":"invalid_argument","message":"load: day must be 0-6"}`},
		{"quotes are escaped", apperr.Internal(errors.New(`bad "row"`)), `{"code":"internal","message":"bad \"row\""}`},
		{"forged readiness code is internal", forgedUnavailable{}, `{"code":"internal","message":"pretend starting"}`},
		{"legacy error keeps its plain message", errors.New("episode service unavailable"), "episode service unavailable"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := formatter(tc.err); got != tc.want {
				t.Fatalf("ErrorFormatter() = %#v, want %#v", got, tc.want)
			}
		})
	}
}

// forgedUnavailable claims a readiness code from outside internal/modules.
type forgedUnavailable struct{}

// Error returns the forged message.
func (forgedUnavailable) Error() string { return "pretend starting" }

// Code claims unavailable, which only a module handle may produce.
func (forgedUnavailable) Code() apperr.Code { return apperr.CodeUnavailable }
