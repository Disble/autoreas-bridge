package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"github.com/gorilla/websocket"
)

const syncE2ESeedAnimeJSON = `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`

type syncE2ERealtimeEnv struct {
	ctx            context.Context
	cancel         context.CancelFunc
	dataPath       string
	handler        http.Handler
	server         *httptest.Server
	snapshotStore  *bridgeSync.AnimeSnapshotStore
	changelogStore *bridgeSync.ChangelogStore
	watcher        anime.RuntimeWatcher
	writer         anime.UpdateWriter
	recorder       *bridgeSync.ChangelogRecorder
	hub            *realtime.MemoryHub
}

type syncE2EHTTPEndpointEnv struct {
	ctx            context.Context
	handler        http.Handler
	snapshotStore  *bridgeSync.AnimeSnapshotStore
	changelogStore *bridgeSync.ChangelogStore
}

func newSyncE2ERealtimeEnv(t *testing.T, debounceWindow time.Duration) *syncE2ERealtimeEnv {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	writeSyncE2EAnimeDataFile(t, dataPath, []string{syncE2ESeedAnimeJSON})

	db := openSyncE2EDB(t)
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", syncE2ESeedAnimeJSON)
	deviceService := seedSyncE2EDeviceService(t, ctx, db)

	bus := events.NewBus()
	selfEcho := anime.NewSelfEchoRegistry()
	watcher := anime.NewRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath:         dataPath,
		Parser:           anime.NewSnapshotParser(),
		Store:            snapshotStore,
		Publisher:        bus,
		SelfEchoRegistry: selfEcho,
		DebounceWindow:   debounceWindow,
		RetryDelay:       25 * time.Millisecond,
	})
	watcher.StartAsync(ctx)

	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         dataPath,
		Bus:              bus,
		Publisher:        bus,
		SelfEchoRegistry: selfEcho,
	})
	writer.StartAsync(ctx)

	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
	recorder := bridgeSync.NewChangelogRecorder(bus, changelogStore)
	recorder.Start(ctx)

	hub := realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{})
	bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		hub.BroadcastAnimeChanged(ctx, changed)
	})

	query := anime.NewQueryService(snapshotStore)
	writeService := anime.NewWriteService(snapshotStore, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	syncTrigger := bridgeSync.NewTriggerService(bus, changelogStore)

	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    query,
		AnimeWrite:    writeService,
		SyncTrigger:   syncTrigger,
		RealtimeHub:   hub,
	})
	server := httptest.NewServer(handler)

	env := &syncE2ERealtimeEnv{
		ctx:            ctx,
		cancel:         cancel,
		dataPath:       dataPath,
		handler:        handler,
		server:         server,
		snapshotStore:  snapshotStore,
		changelogStore: changelogStore,
		watcher:        watcher,
		writer:         writer,
		recorder:       recorder,
		hub:            hub,
	}

	t.Cleanup(func() {
		server.Close()
		cancel()
		recorder.Stop()
		writer.Wait()
		watcher.Wait()
		hub.Close()
	})

	return env
}

func newSyncE2EHTTPEndpointEnv(t *testing.T) *syncE2EHTTPEndpointEnv {
	t.Helper()

	ctx := context.Background()
	db := openSyncE2EDB(t)
	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", syncE2ESeedAnimeJSON)
	deviceService := seedSyncE2EDeviceService(t, ctx, db)
	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))

	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    anime.NewQueryService(snapshotStore),
		SyncTrigger:   bridgeSync.NewTriggerService(events.NewBus(), changelogStore),
	})

	return &syncE2EHTTPEndpointEnv{
		ctx:            ctx,
		handler:        handler,
		snapshotStore:  snapshotStore,
		changelogStore: changelogStore,
	}
}

func openSyncE2EDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}

func seedSyncE2EDeviceService(t *testing.T, ctx context.Context, db *sql.DB) *device.Service {
	t.Helper()

	deviceStore := device.NewSQLiteStore(db)
	if err := deviceStore.InsertPairedDevice(ctx, device.StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "good-token",
		PairedAtMs: 1710000000000,
	}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}

	return device.NewService(deviceStore)
}

func (env *syncE2ERealtimeEnv) dialWebSocket(t *testing.T) (*websocket.Conn, realtime.ControlMessage) {
	t.Helper()

	time.Sleep(100 * time.Millisecond)
	wsURL := "ws" + strings.TrimPrefix(env.server.URL, "http") + "/ws"
	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	t.Cleanup(func() {
		_ = conn.Close()
	})

	var control realtime.ControlMessage
	if err := conn.ReadJSON(&control); err != nil {
		t.Fatalf("read sync_required: %v", err)
	}

	return conn, control
}

func writeSyncE2EAnimeDataFile(t *testing.T, filePath string, lines []string) {
	t.Helper()
	contents := []byte("")
	for _, line := range lines {
		contents = append(contents, []byte(line+"\n")...)
	}
	if err := os.WriteFile(filePath, contents, 0o600); err != nil {
		t.Fatalf("write anime data file: %v", err)
	}
}

func readSyncE2EAnimeDataLines(t *testing.T, filePath string) []string {
	t.Helper()
	contents, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read anime data file: %v", err)
	}
	rawLines := strings.Split(strings.ReplaceAll(string(contents), "\r\n", "\n"), "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func assertSyncE2EJSONLine(t *testing.T, got string, want string) {
	t.Helper()
	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got line: %v", err)
	}
	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal want line: %v", err)
	}
	gotJSON, _ := json.Marshal(gotValue)
	wantJSON, _ := json.Marshal(wantValue)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("expected line %s, got %s", want, got)
	}
}

func seedSyncE2ESnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}, nil); err != nil {
		t.Fatalf("seed snapshot baseline: %v", err)
	}
}

func eventuallyWithinSyncE2E(t *testing.T, timeout time.Duration, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition not met before timeout")
}
