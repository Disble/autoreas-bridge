package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
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
