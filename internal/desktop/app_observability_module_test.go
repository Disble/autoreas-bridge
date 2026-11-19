package desktop

import (
	"database/sql"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
)

// observabilityApp returns an App over db whose clock reads activityTestNow, with its observability
// handle bound through the production configure and bind steps, moved to state.
func observabilityApp(t *testing.T, db *sql.DB, state lifecycle.State) *App {
	t.Helper()
	app := &App{
		bridgeDB:         db,
		nowTime:          activityTestClock,
		processStartedAt: activityTestNow.Add(-activityTestUptime),
		eventQueue:       &stubEventLogQueue{},
	}
	app.ensureCaptureRuntimeDependencies()
	app.configureCaptureReader()
	app.configureSyncDiagReader()
	app.bindObservabilityModule()
	return inModuleState(app, moduleObservability, state)
}

// observabilityBindings are every observability binding: the call reports whether the answer is
// the one a ready module serves over an empty bootstrapped database.
var observabilityBindings = []struct {
	name string
	call func(*App) (bool, error)
}{
	{"SearchActivityFeed", func(a *App) (bool, error) {
		got, err := a.SearchActivityFeed(ActivityFeedQuery{})
		return len(got.Days) == 0 && got.NextCursor == "", err
	}},
	{"GetActivityOverview", func(a *App) (bool, error) {
		got, err := a.GetActivityOverview("24h", 0, 0, "all", nil, false)
		return len(got.Slots) == 24, err
	}},
	{"GetActivityEvent", func(a *App) (bool, error) {
		got, err := a.GetActivityEvent(1)
		return !got.Found, err
	}},
	{"GetActivityPhoneReport", func(a *App) (bool, error) {
		got, err := a.GetActivityPhoneReport(1)
		return !got.Found, err
	}},
	{"GetActivityChangeContext", func(a *App) (bool, error) {
		got, err := a.GetActivityChangeContext(1, activityAt(0))
		return !got.Found, err
	}},
	{"PinActivityMoment", func(a *App) (bool, error) {
		err := a.PinActivityMoment()
		return countRows(a.bridgeDB, `SELECT COUNT(*) FROM incidents`) == 1, err
	}},
	{"GetActivityIncident", func(a *App) (bool, error) {
		got, err := a.GetActivityIncident(1)
		return !got.Found, err
	}},
	{"GetActivityRunStory", func(a *App) (bool, error) {
		got, err := a.GetActivityRunStory("run-1")
		return got.CorrelationID == "run-1", err
	}},
	{"GetActivityRequest", func(a *App) (bool, error) {
		got, err := a.GetActivityRequest("req-1")
		return !got.Found, err
	}},
	{"ListDeviceSyncDiagnostics", func(a *App) (bool, error) {
		got, err := a.ListDeviceSyncDiagnostics(contracts.DeviceSyncDiagnosticsQuery{})
		return got.Items != nil && len(got.Items) == 0, err
	}},
}

// countRows runs a COUNT query; -1 when it fails.
func countRows(db *sql.DB, query string) int {
	var count int
	if err := db.QueryRow(query).Scan(&count); err != nil {
		return -1
	}
	return count
}

// TestObservabilityBindingsFollowTheirModule pins S1 for observability: no Activity or diagnostics
// binding answers an empty value, a degraded stand-in or a database error while its module starts
// or after it failed.
func TestObservabilityBindingsFollowTheirModule(t *testing.T) {
	t.Parallel()
	for _, binding := range observabilityBindings {
		t.Run(binding.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			app := observabilityApp(t, captureAppTestDB(t), lifecycle.StateStarting)
			assertStartingThenFailed(t, app, moduleObservability, "observability is starting", binding.call)
		})
		t.Run(binding.name+"/ready answers the value", func(t *testing.T) {
			t.Parallel()
			served, err := binding.call(observabilityApp(t, captureAppTestDB(t), lifecycle.StateReady))
			assertModuleAnswer(t, served, err, "", "")
		})
	}
}

// TestObservabilityServiceFailuresAreInternal pins that a failing read or write reaches the
// frontend as an internal failure, never as an empty or degraded answer.
func TestObservabilityServiceFailuresAreInternal(t *testing.T) {
	t.Parallel()
	for _, binding := range observabilityBindings {
		t.Run(binding.name, func(t *testing.T) {
			t.Parallel()
			db := captureAppTestDB(t)
			app := observabilityApp(t, db, lifecycle.StateReady)
			if err := db.Close(); err != nil {
				t.Fatalf("close db: %v", err)
			}

			_, err := binding.call(app)

			if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal {
				t.Fatalf("err = %v (code %q), want internal", err, code)
			}
		})
	}
}

// TestBindObservabilityModuleNeedsEveryReader proves the bind step binds nothing while a reader
// the bindings use is missing, so a module that the wiring check would still pass can never be
// marked ready without its services.
func TestBindObservabilityModuleNeedsEveryReader(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		prune func(*App)
	}{
		{"no bridge database", func(a *App) { a.bridgeDB = nil }},
		{"no capture reader", func(a *App) { a.captureReader = nil }},
		{"no sync diagnostics reader", func(a *App) { a.syncDiagReader = nil }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := &App{bridgeDB: captureAppTestDB(t)}
			app.ensureCaptureRuntimeDependencies()
			app.configureCaptureReader()
			app.configureSyncDiagReader()
			tc.prune(app)

			app.bindObservabilityModule()
			_ = app.moduleSet().writer.MarkReady(moduleObservability)

			// An unbound handle is the only way a ready module answers this; a bound one reads.
			if _, err := app.SearchActivityFeed(ActivityFeedQuery{}); err == nil || !strings.Contains(err.Error(), "observability is ready without services") {
				t.Fatalf("SearchActivityFeed = %v; want the unbound-module failure", err)
			}
		})
	}
}
