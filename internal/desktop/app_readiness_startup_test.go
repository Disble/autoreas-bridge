package desktop

import (
	"context"
	"embed"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"

	"github.com/wailsapp/wails/v2/pkg/options"
)

// wailsEpisodesStarting is the rejection the frontend receives for an episodes binding while the
// module starts: the Wails dispatcher (internal/frontend/dispatcher/calls.go, not importable) sends
// ErrorFormatter's value as the callback error, and calls.js rejects with new Error(thatString).
const wailsEpisodesStarting = `{"code":"unavailable","message":"episodes is starting"}`

// productionApp builds the App the way main does (desktop.Options → NewApp), over dataDir instead of
// the everyday data directory, and replaces only the seams that would touch the desktop: the tray,
// the window calls (Wails exits the process on a context it did not issue), the HTTP listener, the
// background duration fetches and the Wails event emitter.
func productionApp(t *testing.T, dataDir string) (*options.App, *App, *readinessEmits) {
	t.Helper()
	// Both point away from %APPDATA%: the override names the copy, and the platform directory the
	// bootstrap compares it against is a temporary one too.
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv(bridgeSync.DataDirEnvVar, dataDir)
	appOptions := Options(embed.FS{})
	app := appOptions.Bind[0].(*App)
	app.newTrayManager = func() tray.Manager { return &tray.MockTrayManager{} }
	noWindow := func(context.Context) {}
	app.hideWindow, app.showWindow, app.unminimiseWindow, app.quitApp = noWindow, noWindow, noWindow, noWindow
	app.newHTTPServer = func(api.Config) api.Server { return &stubAppHTTPServer{} }
	app.episodeDurations = episodeDurationsRuntime{offline: true}
	emits := &readinessEmits{}
	app.emitFn = emits.emit
	t.Cleanup(func() { appOptions.OnShutdown(context.Background()) })
	return appOptions, app, emits
}

// TestProductionStartupGatesTheEpisodeSchedule is the real-startup check of S1 and S9: Today's read
// rejects as unavailable until the episodes module is ready, even once its service is bound, and
// the readiness transitions reach the WebView over the bus NewApp set before the module set's
// first use.
func TestProductionStartupGatesTheEpisodeSchedule(t *testing.T) {
	// Not parallel: t.Setenv, and a real startup registers the process-wide toast activation callback.
	dataDir := t.TempDir()
	appOptions, app, emits := productionApp(t, dataDir)

	// The WebView may call a binding before OnStartup runs; this first use builds the module set.
	_, early := app.GetEpisodeSchedule("Lunes")
	// startHTTPServer runs after the episode service is bound and before episodes is marked ready.
	var bound error
	app.newHTTPServer = func(api.Config) api.Server {
		_, bound = app.GetEpisodeSchedule("Lunes")
		return &stubAppHTTPServer{}
	}

	appOptions.OnStartup(context.Background())

	for name, err := range map[string]error{"before startup": early, "bound, not yet ready": bound} {
		if err == nil {
			t.Fatalf("%s: GetEpisodeSchedule answered without an error", name)
		}
		if got := appOptions.ErrorFormatter(err); got != wailsEpisodesStarting {
			t.Fatalf("%s: Wails rejects with %#v, want %#v", name, got, wailsEpisodesStarting)
		}
	}
	if _, err := os.Stat(filepath.Join(dataDir, "bridge.db")); err != nil {
		t.Fatalf("startup did not open the temporary database: %v", err)
	}
	ready := ModuleReadiness{Module: "episodes", State: "ready"}
	if !slices.Contains(emits.payloads, ready) {
		t.Fatalf("bridge.readiness payloads = %v, want %v from the bus bound at first use", emits.payloads, ready)
	}
	schedule, err := app.GetEpisodeSchedule("Lunes")
	if err != nil || schedule == nil || len(schedule) != 0 {
		t.Fatalf("GetEpisodeSchedule() = %#v, %v; want an empty, non-nil list", schedule, err)
	}
	counts, err := app.GetEpisodeDayCounts()
	if err != nil || counts == nil || len(counts) != 0 {
		t.Fatalf("GetEpisodeDayCounts() = %#v, %v; want an empty, non-nil list", counts, err)
	}
	for name, err := range runtimeModuleCalls(app) {
		if err != nil {
			t.Fatalf("%s after startup = %v, want its module's services bound", name, err)
		}
	}
}

// runtimeModuleCalls calls one binding of each of the api, sync and devices modules, the sync
// binding that reads its bound database, the episodes durations binding that reads its bound
// database, the observability bindings that read each of its bound services, the settings
// binding that reads its bound store, and the notifications bindings that read its store and
// press through its executor.
func runtimeModuleCalls(app *App) map[string]error {
	_, durations := app.GetEpisodeDurationSection(EpisodeDurationAnimeDTO{AnimeID: "anime-1"})
	_, address := app.GetEffectiveAddress()
	_, syncing := app.GetSyncingAnimeItems()
	_, sqliteStatus := app.GetSQLiteStatus()
	_, devices := app.GetConnectedDevices()
	_, feed := app.SearchActivityFeed(ActivityFeedQuery{})
	_, request := app.GetActivityRequest("req-1")
	_, diagnostics := app.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
	_, libraryRoot := app.GetLibraryRoot()
	_, unread := app.GetUnreadNotificationCount()
	_, press := app.ExecuteNotificationAction(1, "act-missing")
	return map[string]error{
		"GetEffectiveAddress": address, "GetSyncingAnimeItems": syncing, "GetSQLiteStatus": sqliteStatus,
		"GetConnectedDevices": devices, "GetLibraryRoot": libraryRoot, "GetEpisodeDurationSection": durations,
		"SearchActivityFeed": feed, "GetActivityRequest": request, "ListDeviceSyncDiagnostics": diagnostics,
		"GetUnreadNotificationCount": unread, "ExecuteNotificationAction": press,
	}
}

// TestProductionStartupFailureRejectsTheEpisodeReads proves a failed startup reaches the frontend
// as failed_precondition with the reason, through the real bootstrap and the wired formatter.
func TestProductionStartupFailureRejectsTheEpisodeReads(t *testing.T) {
	// Not parallel: t.Setenv. A relative override is refused before any file is opened.
	appOptions, app, _ := productionApp(t, "relative-copy")

	appOptions.OnStartup(context.Background())

	want := `{"code":"failed_precondition","message":"bridge database failed to open: ` +
		`resolve bridge db path: AUTOREAS_DATA_DIR must be an absolute path, got \"relative-copy\""}`
	_, scheduleErr := app.GetEpisodeSchedule("Lunes")
	_, countsErr := app.GetEpisodeDayCounts()
	calls := runtimeModuleCalls(app)
	calls["GetEpisodeSchedule"], calls["GetEpisodeDayCounts"] = scheduleErr, countsErr
	for name, err := range calls {
		if err == nil {
			t.Fatalf("%s answered without an error after a failed startup", name)
		}
		if got := appOptions.ErrorFormatter(err); got != want {
			t.Fatalf("%s rejects with %#v, want %#v", name, got, want)
		}
	}
}
