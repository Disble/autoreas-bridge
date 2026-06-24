package api

import (
	"context"
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
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"github.com/gorilla/websocket"
)

func TestWebSocketWithoutBearerReturnsUnauthorized(t *testing.T) {
	t.Parallel()

	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
	})
	defer cleanup()

	conn, res, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		_ = conn.Close()
		t.Fatal("expected websocket handshake to fail without bearer token")
	}

	if res == nil {
		t.Fatal("expected http response for rejected websocket handshake")
	}

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.StatusCode)
	}
}

func TestWebSocketWithBearerReceivesSyncRequired(t *testing.T) {
	t.Parallel()

	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
	})
	defer cleanup()

	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var msg realtime.ControlMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read sync_required: %v", err)
	}

	if msg.Type != realtime.MessageTypeSyncRequired {
		t.Fatalf("expected type %q, got %q", realtime.MessageTypeSyncRequired, msg.Type)
	}

	if msg.Reason != realtime.SyncReasonConnectionGapAssumed {
		t.Fatalf("expected reason %q, got %q", realtime.SyncReasonConnectionGapAssumed, msg.Reason)
	}
}

func TestWebSocketBroadcastsAnimeChangedToConnectedClients(t *testing.T) {
	t.Parallel()

	logger := &recordingAPILogger{}
	hub, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		Logger:        logger,
	})
	defer cleanup()

	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	readControlMessage(t, conn)
	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{
		AnimeID: "anime-123",
		Payload: []byte(`{"nombre":"Bleach"}`),
	})

	var msg realtime.AnimeChangedMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read anime_changed: %v", err)
	}

	if msg.Type != realtime.MessageTypeAnimeChanged {
		t.Fatalf("expected type %q, got %q", realtime.MessageTypeAnimeChanged, msg.Type)
	}

	if msg.AnimeID != "anime-123" {
		t.Fatalf("expected anime id %q, got %q", "anime-123", msg.AnimeID)
	}

	if got, want := strings.TrimSpace(string(msg.Payload)), `{"nombre":"Bleach"}`; got != want {
		t.Fatalf("expected payload %s, got %s", want, got)
	}

	entries := logger.entries()
	if len(entries) == 0 || entries[0].Domain != "websocket" || entries[0].Level != sharedlogger.LevelInfo {
		t.Fatalf("expected websocket info log, got %#v", entries)
	}
}

func TestWebSocketReconnectDoesNotLeakClients(t *testing.T) {
	t.Parallel()

	hub, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
	})
	defer cleanup()

	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	firstConn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial first websocket: %v", err)
	}
	readControlMessage(t, firstConn)
	waitForClientCount(t, hub, 1)
	if err := firstConn.Close(); err != nil {
		t.Fatalf("close first websocket: %v", err)
	}
	waitForClientCount(t, hub, 0)

	secondConn, _, err := websocket.DefaultDialer.Dial(wsURL+"?token=good-token", nil)
	if err != nil {
		t.Fatalf("dial second websocket: %v", err)
	}
	defer secondConn.Close()
	readControlMessage(t, secondConn)
	waitForClientCount(t, hub, 1)
	if err := secondConn.Close(); err != nil {
		t.Fatalf("close second websocket: %v", err)
	}
	waitForClientCount(t, hub, 0)
}

func newWebsocketTestServer(t *testing.T, config Config) (*realtime.MemoryHub, string, func()) {
	t.Helper()

	hub, ok := config.RealtimeHub.(*realtime.MemoryHub)
	if !ok {
		t.Fatal("expected realtime memory hub in test config")
	}
	handler := NewHandler(config)
	server := httptest.NewServer(handler)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	return hub, wsURL, func() {
		server.Close()
		_ = hub.Close()
	}
}

func readControlMessage(t *testing.T, conn *websocket.Conn) realtime.ControlMessage {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	var msg realtime.ControlMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read control message: %v", err)
	}
	return msg
}

func waitForClientCount(t *testing.T, hub *realtime.MemoryHub, want int) {
	t.Helper()

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if hub.ClientCount() == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("expected client count %d, got %d", want, hub.ClientCount())
}

func TestWebSocketBroadcastPayloadIsValidJSON(t *testing.T) {
	t.Parallel()

	payload := realtime.AnimeChangedMessage{Payload: json.RawMessage(`{"nombre":"Bleach"}`)}
	if !json.Valid(payload.Payload) {
		t.Fatal("expected payload to remain valid json")
	}
}

func TestWebSocketIncomingReconcileMessageWritesAnimeData(t *testing.T) {
	t.Parallel()

	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	writeAnimeDataFileForWebSocketTest(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`,
	})

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedWebSocketAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	bus := events.NewBus()
	writerCtx, cancelWriter := context.WithCancel(context.Background())
	defer cancelWriter()
	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         dataPath,
		Bus:              bus,
		Publisher:        bus,
		Logger:           websocketWarningLogger{},
		SelfEchoRegistry: anime.NewSelfEchoRegistry(),
	})
	writer.StartAsync(writerCtx)
	defer func() {
		cancelWriter()
		writer.Wait()
	}()

	query := anime.NewQueryService(store)
	writeService := anime.NewWriteService(store, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	hub, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		AnimeQuery:    query,
		AnimeWrite:    writeService,
		SyncTrigger:   stubSyncService{},
	})
	defer cleanup()
	_ = hub

	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	readControlMessage(t, conn)

	message := map[string]any{
		"type":              "reconcile",
		"device_id":         "device-1",
		"last_changelog_id": 0,
		// base:0 matches seedWebSocketAnimeSnapshot's default ModifiedAt --
		// fast-forward, not an SDD-30 old-client safe path.
		"pending_operations": []map[string]any{{
			"anime_id":   "anime-1",
			"operation":  "update",
			"payload":    map[string]any{"nrocapvisto": 664.0, "base": 0},
			"created_at": 1710000000123,
		}},
	}
	if err := conn.WriteJSON(message); err != nil {
		t.Fatalf("write websocket message: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		lines := readAnimeDataLinesForWebSocketTest(t, dataPath)
		if len(lines) == 2 {
			assertJSONLineEqualForWebSocketTest(t, lines[1], `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true,"fechaUltCapVisto":{"$$date":1710000000123}}`)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Fatalf("expected websocket reconcile message to append updated anime line, got %v", readAnimeDataLinesForWebSocketTest(t, dataPath))
}

type websocketWarningLogger struct{}

func (websocketWarningLogger) Warnf(string, ...any) {}

func writeAnimeDataFileForWebSocketTest(t *testing.T, filePath string, lines []string) {
	t.Helper()
	contents := []byte("")
	for _, line := range lines {
		contents = append(contents, []byte(line+"\n")...)
	}
	if err := os.WriteFile(filePath, contents, 0o600); err != nil {
		t.Fatalf("write anime data file: %v", err)
	}
}

func readAnimeDataLinesForWebSocketTest(t *testing.T, filePath string) []string {
	t.Helper()
	contents, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read anime data file: %v", err)
	}
	lines := strings.Split(strings.ReplaceAll(string(contents), "\r\n", "\n"), "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		filtered = append(filtered, line)
	}
	return filtered
}

func assertJSONLineEqualForWebSocketTest(t *testing.T, got string, want string) {
	t.Helper()
	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got line: %v", err)
	}
	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal want line: %v", err)
	}
	if !deepEqualJSON(gotValue, wantValue) {
		t.Fatalf("expected line %s, got %s", want, got)
	}
}

func deepEqualJSON(got any, want any) bool {
	left, err := json.Marshal(got)
	if err != nil {
		return false
	}
	right, err := json.Marshal(want)
	if err != nil {
		return false
	}
	return string(left) == string(right)
}

func seedWebSocketAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()
	records := map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}
	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed anime snapshot: %v", err)
	}
}
