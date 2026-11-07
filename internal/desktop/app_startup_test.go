package desktop

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/observability/activityread"
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/observability/syncreading"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tracerbullet"
)

func TestAppStartupBootstrapsSQLite(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	called := false
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		called = true
		return wantDB, nil
	}

	ctx := context.Background()
	app.startup(ctx)

	if !called {
		t.Fatal("expected startup to invoke sqlite bootstrap")
	}
	if app.ctx != ctx {
		t.Fatal("expected startup to retain context")
	}
	if app.bridgeDB != wantDB {
		t.Fatal("expected startup to store bootstrapped db handle")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupStoresSQLiteBootstrapError(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("sqlite bootstrap failed")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return nil, wantErr }

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("expected startupErr %v, got %v", wantErr, app.startupErr)
	}
	if app.bridgeDB != nil {
		t.Fatal("expected no db handle when bootstrap fails")
	}
}

func TestAppStartupInitializesDownloadStoreBeforeHTTPServerFailure(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("http server failed")
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		return bridgeSync.OpenBridgeDB(dbPath)
	}
	app.newDownloadStore = nil
	app.newHTTPServer = func(api.Config) api.Server {
		return &stubAppHTTPServer{startErr: wantErr}
	}
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("expected startupErr %v, got %v", wantErr, app.startupErr)
	}
	got := app.SetScheduleConfig(contracts.ScheduleConfig{
		Mode:            "in_process",
		DailyTimeHHMM:   "09:00",
		Enabled:         true,
		EnabledWeekdays: 127,
	})
	if got != "ok" {
		t.Fatalf("expected schedule config to persist through the initialized download store, got %q", got)
	}
}

// insertDeviceState stores one device_sync_state row.
func insertDeviceState(t *testing.T, db *sql.DB, deviceID, status string, lastSeenMS int64) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO device_sync_state (device_id, last_ack_changelog_id, last_seen_at_ms, sync_status)
		VALUES (?, 0, ?, ?)`, deviceID, lastSeenMS, status); err != nil {
		t.Fatalf("insert device state: %v", err)
	}
}

// TestAppStartupReadsLastContactsBeforeTheServerExists proves S4's ordering: the
// server is built holding the stored value, and only Start accepts a contact, so
// no contact can overwrite it first. Only active devices are recorded.
func TestAppStartupReadsLastContactsBeforeTheServerExists(t *testing.T) {
	t.Parallel()

	// Recent, because startup marks a long-silent device stale first.
	lastSeenMS := time.Now().UnixMilli()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		db, err := bridgeSync.OpenBridgeDB(dbPath)
		if err == nil {
			insertDeviceState(t, db, "tablet", bridgeSync.DeviceSyncStatusActive, lastSeenMS)
			insertDeviceState(t, db, "old-tablet", "revoked", lastSeenMS+1)
		}
		return db, err
	}
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})
	var got map[string]int64
	app.newHTTPServer = func(api.Config) api.Server {
		got = app.startLastContacts
		return &stubAppHTTPServer{}
	}

	app.startup(context.Background())

	if want := map[string]int64{"tablet": lastSeenMS}; !reflect.DeepEqual(got, want) {
		t.Fatalf("contacts when the server was built = %v, want %v", got, want)
	}
}

// TestStartRecordOfTheBusiestBridgeSurvivesTheMetadataBound stores a full record
// through the real event store: past 4 KB the metadata becomes a marker and the
// whole record is lost, so the cap has to hold with room to spare.
func TestStartRecordOfTheBusiestBridgeSurvivesTheMetadataBound(t *testing.T) {
	t.Parallel()

	states := make([]bridgeSync.DeviceSyncState, maxStartContacts+5)
	for i := range states {
		states[i] = bridgeSync.DeviceSyncState{DeviceID: strings.Repeat("d", 60) + strconv.Itoa(i),
			LastSeenAtMs: 1_794_001_306_685, SyncStatus: bridgeSync.DeviceSyncStatusActive}
	}
	contacts := activeLastContacts(states)
	if len(contacts) != maxStartContacts {
		t.Fatalf("contacts = %d, want the cap %d", len(contacts), maxStartContacts)
	}
	db := captureAppTestDB(t)
	err := eventlog.NewStore(db).InsertEvent(context.Background(), eventlog.EventRecord{
		OccurredAtMS: 1000, Domain: "api", Level: sharedlogger.LevelInfo, Message: "http server listening on [::]:9876", EventType: "api.listening",
		Metadata: map[string]any{"addr": "[::]:9876", syncreading.LastContactsKey: contacts},
	})
	if err != nil {
		t.Fatalf("insert start: %v", err)
	}

	starts, err := activityread.New(db).SyncStarts(context.Background())
	if err != nil || len(starts) != 1 || !reflect.DeepEqual(starts[0].LastContacts, contacts) {
		t.Fatalf("starts = %+v, %v; want the whole record back", starts, err)
	}
}

// TestCaptureLastContactsLogsAFailedRead pins the degraded start: no record, a
// warning with its cause, and a Bridge that starts anyway.
func TestCaptureLastContactsLogsAFailedRead(t *testing.T) {
	t.Parallel()

	logger := &incidentTestLogger{}
	app := &App{bridgeDB: captureAppTestDB(t), sharedLogger: logger.fanout()}
	if _, err := app.bridgeDB.Exec(`DROP TABLE device_sync_state`); err != nil {
		t.Fatalf("drop device_sync_state: %v", err)
	}

	app.captureLastContacts(context.Background(), bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(app.bridgeDB)))

	if app.startLastContacts != nil {
		t.Fatalf("contacts = %v, want none", app.startLastContacts)
	}
	if len(logger.entries) != 1 || logger.entries[0].EventType != "api.last_contacts_unread" ||
		logger.entries[0].Level != sharedlogger.LevelWarn || logger.entries[0].Metadata["cause"] == "" {
		t.Fatalf("log = %#v, want one warning with its cause", logger.entries)
	}
}

func TestAppStartupBootstrapsSQLiteAndWiresCommittedPublisher(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	app := newAppTestApp(t)
	configureStartupRuntimeDependencies(t, app, wantDB)

	ctx := context.Background()
	app.startup(ctx)

	if app.bridgeDB != wantDB {
		t.Fatal("expected sqlite db handle to be retained")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupNewNotifierOverrideSeamInjectsFakeNotifier(t *testing.T) {
	t.Parallel()

	fake := &stubAppNotifier{}
	var receivedEmit func(ctx context.Context, eventName string, optionalData ...any)
	var receivedLoggers []sharedlogger.Logger
	app := newAppTestApp(t)
	app.newNotifier = func(emit func(ctx context.Context, eventName string, optionalData ...any), loggers ...sharedlogger.Logger) notification.Notifier {
		receivedEmit = emit
		receivedLoggers = loggers
		return fake
	}

	app.startup(context.Background())

	if app.notifier != fake {
		t.Fatal("expected startup to wire the newNotifier override's returned fake into app.notifier")
	}
	if receivedEmit == nil {
		t.Fatal("expected newNotifier to receive a non-nil emit function")
	}
	if receivedLoggers == nil {
		t.Fatal("expected newNotifier to receive the shared loggers")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupDefaultsNewNotifierWhenOverrideAbsent(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.startup(context.Background())

	if app.notifier == nil {
		t.Fatal("expected startup to default-construct a notifier when no override is provided")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestDefaultNotifierRegistersLogForwardAdapterWhenLoggerIsNonNil(t *testing.T) {
	t.Parallel()

	logger := &recordingSharedAppLogger{}
	notifier := defaultNotifier(func(context.Context, string, ...any) {}, logger)

	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})

	if got := len(logger.entries); got != 1 {
		t.Fatalf("expected the log-forward adapter to write exactly 1 log entry, got %d", got)
	}
}

func TestDefaultNotifierDoesNotRegisterLogForwardAdapterWhenLoggerIsNil(t *testing.T) {
	t.Parallel()

	notifier := defaultNotifier(func(context.Context, string, ...any) {})
	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})
}

func TestDefaultNotifierDoesNotRegisterLogForwardAdapterWhenLoggerArgIsNilValue(t *testing.T) {
	t.Parallel()

	var nilLogger sharedlogger.Logger
	notifier := defaultNotifier(func(context.Context, string, ...any) {}, nilLogger)
	_ = notifier.Notify(context.Background(), notification.Notification{
		Title: "x", Level: notification.LevelInfo, Source: "test",
	})
}

func TestAppStartupStartsTracerBulletWithSharedEventBus(t *testing.T) {
	t.Parallel()

	var receivedBus events.Bus
	var receivedSink tracerbullet.TraceRecorder
	runner := &stubTracerBulletRunner{}
	var publisherBus events.Bus
	recorder := &stubAppChangelogRecorder{}
	app := newAppTestApp(t)
	app.newCommittedPublisher = func(bus events.Bus) anime.CommittedPublisher {
		publisherBus = bus
		// Nil keeps startup recovery off this test's placeholder database;
		// TestAppStartupRecoversStagedWritesBeforeEvents covers a real publisher.
		return nil
	}
	app.newChangelogRecorder = func(events.Bus, changelogPendingInserter, ...sharedlogger.Logger) changelogRecorder {
		return recorder
	}
	app.newTracerBulletSink = func() tracerbullet.TraceRecorder { return &stubTraceSink{} }
	app.newTracerBulletRunner = func(bus events.Bus, sink tracerbullet.TraceRecorder, _ ...sharedlogger.Logger) tracerBulletRunner {
		receivedBus = bus
		receivedSink = sink
		return runner
	}

	app.startup(context.Background())

	if receivedBus == nil {
		t.Fatal("expected startup to create tracer bullet with shared event bus")
	}
	if receivedSink == nil {
		t.Fatal("expected startup to create tracer bullet sink")
	}
	if !runner.started {
		t.Fatal("expected startup to start tracer bullet runner")
	}
	if app.tracerBulletRunner != runner {
		t.Fatal("expected app to retain tracer bullet runner")
	}
	if publisherBus == nil || publisherBus != receivedBus {
		t.Fatal("expected startup to build the committed publisher over the shared event bus")
	}
	if !recorder.started {
		t.Fatal("expected startup to start changelog recorder")
	}
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
}

func TestAppStartupSubscribesRealtimeHubToAnimeChangedEvents(t *testing.T) {
	t.Parallel()

	realtimeHub := &stubAppRealtimeHub{received: make(chan events.AnimeChangedEvent, 1)}
	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newRealtimeHub = func(context.Context) realtime.Hub { return realtimeHub }
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.RealtimeHub != realtimeHub {
			t.Fatal("expected realtime hub to be passed into http server config")
		}
		return server
	}

	app.startup(context.Background())
	app.eventBus.Publish(events.AnimeChangedEvent{AnimeID: "anime-1", Payload: []byte(`{"name":"Bleach"}`)})

	select {
	case event := <-realtimeHub.received:
		if event.AnimeID != "anime-1" {
			t.Fatalf("expected anime id %q, got %q", "anime-1", event.AnimeID)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected anime changed event to be forwarded to realtime hub")
	}
}

func TestAppStartupWiresCaptureQueueIntoHTTPServerAfterBridgeDBBootstrap(t *testing.T) {
	t.Parallel()

	server := &stubAppHTTPServer{}
	app := newAppTestApp(t)
	app.newCaptureQueue = func(*sql.DB) captureQueue { return &stubCaptureQueue{} }
	app.newHTTPServer = func(config api.Config) api.Server {
		if config.Capture == nil {
			t.Fatal("expected startup to wire capture queue into http server config")
		}
		config.Capture(requestcapture.NewCaptureRecord("patch", "device-1"))
		return server
	}

	app.startup(context.Background())

	if app.captureQueue == nil {
		t.Fatal("expected startup to retain the capture queue")
	}
}

// A second instance losing the port race must not lose its desktop download
// features. The HTTP server serves mobile sync; readiness, the download service
// and the scheduler are local and do not depend on it. Before this, a failed
// bind set startupErr and startup returned before startDownloadOrchestration,
// leaving readinessService nil and every Downloads panel reporting
// "Download readiness unavailable".
func TestAppStartupWiresDownloadOrchestrationDespiteHTTPServerFailure(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("listen tcp :9876: bind: address already in use")
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) {
		return bridgeSync.OpenBridgeDB(dbPath)
	}
	app.newDownloadStore = nil
	app.newHTTPServer = func(api.Config) api.Server {
		return &stubAppHTTPServer{startErr: wantErr}
	}
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("startupErr = %v, want the bind failure still reported", app.startupErr)
	}
	if app.readinessService == nil {
		t.Fatal("readiness service was not wired: a failed HTTP bind must not skip download orchestration")
	}
	if _, err := app.ListDownloadReadiness(); err != nil {
		t.Fatalf("ListDownloadReadiness after a failed bind = %v, want a usable snapshot", err)
	}
}
