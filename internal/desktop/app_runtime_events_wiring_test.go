package desktop

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/eventlog"
	bridgeSync "autoreas-bridge/internal/sync"
)

// newObservableEventReaderApp builds an app whose shared logger records into a
// MemLogger, so a test can assert what the wiring told the operator -- the only
// externally visible outcome the seam has beyond the reader field itself.
func newObservableEventReaderApp(app *App) (*App, *sharedlogger.MemLogger) {
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)
	return app, memLogger
}

// TestConfigureEventReaderIsNilSafeAndBuildsOnce asserts the runtime-event read
// seam is wired exactly once, mirroring configureCaptureReader's guard: a
// second call must not replace a reader an earlier call already built, and a
// successful wiring says nothing to the operator.
func TestConfigureEventReaderIsNilSafeAndBuildsOnce(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: db, newEventReader: eventlog.NewReader})

	app.configureEventReader()
	if app.eventReader == nil {
		t.Fatal("expected configureEventReader to build a reader when bridgeDB is set")
	}
	first := app.eventReader
	app.configureEventReader()
	if app.eventReader != first {
		t.Fatal("expected configureEventReader to be a no-op once a reader already exists")
	}
	if entries := memLogger.Recent(); len(entries) != 0 {
		t.Fatalf("expected a successful wiring to log nothing, got %#v", entries)
	}
}

// TestConfigureEventReaderNoopWhenBridgeDBNil asserts the seam stays unwired
// rather than constructing a reader over a nil handle.
func TestConfigureEventReaderNoopWhenBridgeDBNil(t *testing.T) {
	t.Parallel()
	app := &App{newEventReader: eventlog.NewReader}

	app.configureEventReader()
	if app.eventReader != nil {
		t.Fatal("expected configureEventReader to stay nil when bridgeDB is nil")
	}
}

// TestConfigureEventReaderNoopWhenConstructorNil asserts a test or degraded
// bootstrap that deliberately leaves the constructor seam nil gets no reader,
// rather than a panic on the nil call.
func TestConfigureEventReaderNoopWhenConstructorNil(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: db})

	app.configureEventReader()
	if app.eventReader != nil {
		t.Fatal("expected configureEventReader to stay nil when newEventReader is nil")
	}
	// A deliberately unwired seam is a guarded no-op, not a recovered crash:
	// it must return before the call, so nothing reaches the operator.
	if entries := memLogger.Recent(); len(entries) != 0 {
		t.Fatalf("expected a guarded no-op to log nothing, got %#v", entries)
	}
}

// TestConfigureEventReaderUsesTheAppsOwnBridgeDBHandle is the D-1 guard: the
// desktop read path reuses a.bridgeDB and never opens a second SQLite
// connection. Only the MCP sidecar, being a separate process, opens its own.
func TestConfigureEventReaderUsesTheAppsOwnBridgeDBHandle(t *testing.T) {
	t.Parallel()
	db := openRuntimeEventsTestDB(t)
	var handedTo *sql.DB
	app := &App{bridgeDB: db, newEventReader: func(handle *sql.DB) *eventlog.Reader {
		handedTo = handle
		return eventlog.NewReader(handle)
	}}

	app.configureEventReader()
	if handedTo != db {
		t.Fatalf("expected the app's own bridgeDB handle to reach the seam, got %p want %p", handedTo, db)
	}
}

// TestConfigureEventReaderSurvivesAnUnusableBridgeHandle asserts a bare,
// unopened handle leaves the seam unwired instead of taking startup down.
// eventlog.NewReader probes runtime_events on construction, and database/sql
// panics rather than erroring on such a handle -- the same hazard
// sweepOrphanedCaptures and readEventPersistDebugSetting already guard. A
// best-effort observability read path must degrade, never abort the boot.
func TestConfigureEventReaderSurvivesAnUnusableBridgeHandle(t *testing.T) {
	t.Parallel()
	app, memLogger := newObservableEventReaderApp(&App{bridgeDB: &sql.DB{}, newEventReader: eventlog.NewReader})

	app.configureEventReader()
	if app.eventReader != nil {
		t.Fatal("expected an unusable bridge handle to leave the runtime-event reader unwired")
	}
	// Degrading silently would make an unreadable event store indistinguishable
	// from one that was never configured, so the recovered failure is reported.
	entries := memLogger.Recent()
	if len(entries) != 1 {
		t.Fatalf("expected exactly one warning for the recovered failure, got %#v", entries)
	}
	if entries[0].Domain != "api" || entries[0].Level != "warn" {
		t.Fatalf("expected an api-domain warning, got domain %q level %q", entries[0].Domain, entries[0].Level)
	}
	if !strings.Contains(entries[0].Message, "failed to wire the runtime-event reader") {
		t.Fatalf("expected the warning to name the failure, got %q", entries[0].Message)
	}
}

// TestConfigureEventReaderSurvivesAnUnusableHandleWithNoLogger asserts the
// recovery path itself is nil-safe. The seam can run before the shared logger
// exists, and a report attempted through a nil logger would panic from inside
// the deferred recover -- turning the guard that exists to keep startup alive
// into the thing that kills it.
func TestConfigureEventReaderSurvivesAnUnusableHandleWithNoLogger(t *testing.T) {
	t.Parallel()
	app := &App{bridgeDB: &sql.DB{}, newEventReader: eventlog.NewReader}

	app.configureEventReader()
	if app.eventReader != nil {
		t.Fatal("expected an unusable bridge handle to leave the runtime-event reader unwired")
	}
}

// TestStartupWiresTheRuntimeEventReader asserts the seam is actually reached
// from startup's service wiring and defaulted there, not merely callable in
// isolation: newAppTestApp leaves newEventReader nil, so a wired reader proves
// both the default and the call site.
func TestStartupWiresTheRuntimeEventReader(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		return bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	}
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}

	if app.eventReader == nil {
		t.Fatal("expected startup to wire the runtime-event reader")
	}
}
