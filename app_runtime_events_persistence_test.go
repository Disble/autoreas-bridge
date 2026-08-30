package main

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/observability/eventlog"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/testsupport/async"
)

// TestLoggedEventSurvivesBridgeRestart asserts an event logged and persisted
// before the bridge process stops is queryable after a restart, per the
// observability spec's "A logged event is queryable after an app restart".
func TestLoggedEventSurvivesBridgeRestart(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")

	first := newAppTestApp(t)
	first.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	first.newEventQueue = nil // use the real eventlog queue, not newAppTestApp's stub
	first.startup(context.Background())
	if first.startupErr != nil {
		first.shutdown(context.Background())
		t.Fatalf("first startup: %v", first.startupErr)
	}
	func() {
		defer first.shutdown(context.Background())
		first.sharedLogger.Infof("sync", "distinctive-restart-event")
		waitForRuntimeEventRow(t, first.bridgeDB, "distinctive-restart-event")
	}()

	second := newAppTestApp(t)
	second.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	second.newEventQueue = nil // use the real eventlog queue, not newAppTestApp's stub
	second.startup(context.Background())
	if second.startupErr != nil {
		second.shutdown(context.Background())
		t.Fatalf("second startup: %v", second.startupErr)
	}
	defer second.shutdown(context.Background())

	reader := eventlog.NewReader(second.bridgeDB)
	if !reader.Available() {
		t.Fatal("expected runtime_events to be available across restart")
	}
	page, err := reader.Search(context.Background(), eventlog.EventSearchParams{Filters: eventlog.EventFilters{Text: "distinctive-restart-event"}})
	if err != nil {
		t.Fatalf("search events after restart: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected the event to survive the restart, got %#v", page.Items)
	}
}

// TestGetRecentLogsUnchangedWithEventPersistenceActive asserts the in-memory
// GetRecentLogs feed behaves exactly as before with event persistence wired.
func TestGetRecentLogsUnchangedWithEventPersistenceActive(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}

	app.sharedLogger.Infof("sync", "recent-logs-still-work")

	got := app.GetRecentLogs()
	found := false
	for _, entry := range got {
		if entry.Message == "recent-logs-still-work" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected GetRecentLogs to still surface the entry, got %#v", got)
	}
}

// TestEventPersistenceWritesOnlyRuntimeEvents asserts persisting a runtime
// event grows runtime_events and no other table in the bridge database.
//
// This deliberately enumerates tables from sqlite_master instead of naming
// the activity-owned table: tools/checkarchitecture forbids any reference to
// that name outside internal/activity, and the enumeration is the stronger
// assertion anyway -- it covers every table in the schema rather than the one
// a hand-written list happened to remember.
func TestEventPersistenceWritesOnlyRuntimeEvents(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	app.newEventQueue = nil // use the real eventlog queue, not newAppTestApp's stub
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}

	before := snapshotTableRowCounts(t, app.bridgeDB)

	app.sharedLogger.Infof("sync", "only-runtime-events-grow")
	waitForRuntimeEventRow(t, app.bridgeDB, "only-runtime-events-grow")

	for table, after := range snapshotTableRowCounts(t, app.bridgeDB) {
		if table == runtimeEventsTableName {
			continue
		}
		if after != before[table] {
			t.Fatalf("expected only %s to grow, but %s went from %d to %d rows", runtimeEventsTableName, table, before[table], after)
		}
	}
}

// runtimeEventsTableName is the one table event persistence may write.
const runtimeEventsTableName = "runtime_events"

// snapshotTableRowCounts returns the current row count of every user table in
// the database, keyed by table name, discovered from sqlite_master so no table
// name has to be hardcoded here.
func snapshotTableRowCounts(t *testing.T, db *sql.DB) map[string]int {
	t.Helper()

	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		t.Fatalf("list tables: %v", err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			_ = rows.Close()
			t.Fatalf("scan table name: %v", err)
		}
		tables = append(tables, name)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		t.Fatalf("iterate tables: %v", err)
	}
	if err := rows.Close(); err != nil {
		t.Fatalf("close table list: %v", err)
	}

	counts := make(map[string]int, len(tables))
	for _, table := range tables {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM "` + table + `"`).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		counts[table] = count
	}
	return counts
}

// TestEarlyBootEventsSurviveUntilQueueBinding is the regression test for
// docs/mcp-event-visibility-report.md. Startup emits the whole tracer-bullet
// flow at app.go:199, while the only Sink.Bind call is reached at app.go:208
// via configureRuntimeServices -> configureEventLogQueue. Those entries used
// to drop, so runtime_events (the MCP sidecar's only source) disagreed with
// the in-memory feed the UI reads and the flow was invisible to the MCP.
//
// This asserts the opposite of the behaviour it replaces: the early-boot
// window is now buffered and flushed by Bind, not counted as loss.
func TestEarlyBootEventsSurviveUntilQueueBinding(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	app.newEventQueue = nil // use the real eventlog queue, not newAppTestApp's stub
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	if app.startupErr != nil {
		t.Fatalf("startup: %v", app.startupErr)
	}

	if app.eventSink == nil {
		t.Fatal("expected startup to construct the event sink")
	}
	if got := app.eventSink.UnboundDrops(); got != 0 {
		t.Fatalf("expected the early-boot window to be buffered rather than dropped, got %d drops", got)
	}

	// "tracer bullet ready" is emitted at app.go:199, before the database is
	// even bootstrapped -- the deepest point inside the old drop window.
	waitForRuntimeEventRow(t, app.bridgeDB, "tracer bullet ready")

	// SDD-64: the tracer bullet's entries used to land in whatever domain its
	// message prefix happened to spell ("system", "anime", ...) because the
	// runner split its own prose to pick one. They now declare the fixed
	// `tracer-bullet` domain, which is what lets a health rollup exclude
	// synthetic traffic. This test's subject is unchanged: a pre-bind event
	// must be queryable through the reader the MCP sidecar uses.
	reader := eventlog.NewReader(app.bridgeDB)
	page, err := reader.Search(context.Background(), eventlog.EventSearchParams{Filters: eventlog.EventFilters{Domain: "tracer-bullet"}})
	if err != nil {
		t.Fatalf("search events: %v", err)
	}
	if len(page.Items) == 0 {
		t.Fatal("expected the pre-bind tracer-bullet event to be queryable, which is what the MCP sidecar reads")
	}
}

// TestEventPersistDebugSettingRoundTripsAndDefaultsOff asserts the
// observability.events.persist_debug app_settings key round-trips and
// defaults to OFF when absent.
func TestEventPersistDebugSettingRoundTripsAndDefaultsOff(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer func() { _ = db.Close() }()

	app := &App{bridgeDB: db}
	if got := app.readEventPersistDebugSetting(context.Background()); got {
		t.Fatal("expected persist_debug to default to false when unset")
	}

	if _, err := db.Exec(`INSERT INTO app_settings (key, value) VALUES (?, ?)`, eventPersistDebugSettingKey, "true"); err != nil {
		t.Fatalf("seed persist_debug setting: %v", err)
	}
	if got := app.readEventPersistDebugSetting(context.Background()); !got {
		t.Fatal("expected persist_debug to round-trip as true once set")
	}
}

// waitForRuntimeEventRow polls runtime_events until a row with the given
// message appears, avoiding a fixed sleep for the async sink/queue drain.
func waitForRuntimeEventRow(t *testing.T, db *sql.DB, message string) {
	t.Helper()
	async.Eventually(t, func() bool {
		var count int
		err := db.QueryRow(`SELECT COUNT(*) FROM runtime_events WHERE message = ?`, message).Scan(&count)
		return err == nil && count > 0
	}, "timed out waiting for runtime_events row with message %q", message)
}
