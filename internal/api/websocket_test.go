package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/mobilecapture"
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
	defer closeWebsocket(t, conn)

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
	defer closeWebsocket(t, conn)

	readControlMessage(t, conn)
	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{
		AnimeID: "anime-123",
		Payload: []byte(`{"name":"Bleach"}`),
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

	if got, want := strings.TrimSpace(string(msg.Payload)), `{"name":"Bleach"}`; got != want {
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
	readControlMessage(t, secondConn)
	waitForClientCount(t, hub, 1)
	if err := secondConn.Close(); err != nil {
		t.Fatalf("close second websocket: %v", err)
	}
	waitForClientCount(t, hub, 0)
}

func TestWebSocketBroadcastPayloadIsValidJSON(t *testing.T) {
	t.Parallel()

	payload := realtime.AnimeChangedMessage{Payload: json.RawMessage(`{"name":"Bleach"}`)}
	if !json.Valid(payload.Payload) {
		t.Fatal("expected payload to remain valid json")
	}
}

func TestWebSocketIncomingReconcileMessageWritesAnimeData(t *testing.T) {
	t.Parallel()

	snapshots, query, writeService := newWebSocketWriteEnvironment(t)

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
	defer closeWebsocket(t, conn)

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
			"payload":    map[string]any{"episodesWatched": 664.0, "base": 0},
			"created_at": 1710000000123,
		}},
	}
	if err := conn.WriteJSON(message); err != nil {
		t.Fatalf("write websocket message: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		record, err := snapshots.GetSnapshot(context.Background(), "anime-1")
		if err == nil && record.ModifiedAt != 0 {
			assertJSONLineEqualForWebSocketTest(t, string(record.CanonicalJSON), `{"id":"anime-1","name":"One Piece","episodesWatched":664,"status":2,"totalEpisodes":1200,"active":true,"lastWatchedAt":1710000000123}`)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Fatal("expected websocket reconcile message to finalize the updated anime snapshot")
}

func TestWSReconcileAcceptedCapture(t *testing.T) {
	t.Parallel()

	captures := []mobilecapture.CaptureRecord{}
	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", Name: "Phone", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		AnimeWrite:    stubWebSocketAnimeWrite{},
		SyncTrigger:   stubSyncService{},
		Capture: func(record mobilecapture.CaptureRecord) bool {
			captures = append(captures, record)
			return true
		},
	})
	defer cleanup()

	conn := dialWebSocketWithToken(t, wsURL, "good-token")
	defer closeWebsocket(t, conn)
	readControlMessage(t, conn)
	if err := conn.WriteJSON(map[string]any{"type": "reconcile", "last_changelog_id": 7, "pending_operations": []map[string]any{{"anime_id": "anime-1", "operation": "update", "payload": map[string]any{"episodesWatched": 3}, "created_at": 1710000000123}}}); err != nil {
		t.Fatalf("write websocket reconcile: %v", err)
	}
	waitForCaptureCount(t, &captures, 1)
	if captures[0].Outcome != "accepted" || captures[0].Device.DeviceID != "device-1" {
		t.Fatalf("unexpected accepted capture %#v", captures[0])
	}
}

func TestWSReconcileRejectedCapture(t *testing.T) {
	t.Parallel()

	captures := []mobilecapture.CaptureRecord{}
	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", Name: "Phone", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		AnimeWrite:    stubWebSocketAnimeWrite{err: context.DeadlineExceeded},
		SyncTrigger:   stubSyncService{},
		Capture: func(record mobilecapture.CaptureRecord) bool {
			captures = append(captures, record)
			return true
		},
	})
	defer cleanup()

	conn := dialWebSocketWithToken(t, wsURL, "good-token")
	defer closeWebsocket(t, conn)
	readControlMessage(t, conn)
	if err := conn.WriteJSON(map[string]any{"type": "reconcile", "last_changelog_id": 7, "pending_operations": []map[string]any{{"anime_id": "anime-1", "operation": "update", "payload": map[string]any{"episodesWatched": 3}, "created_at": 1710000000123}}}); err != nil {
		t.Fatalf("write websocket reconcile: %v", err)
	}
	waitForCaptureCount(t, &captures, 1)
	if captures[0].Outcome != "rejected" {
		t.Fatalf("unexpected rejected capture %#v", captures[0])
	}
}

func TestWSReconcileCapturesResponseBodyOnReject(t *testing.T) {
	t.Parallel()

	captures := []mobilecapture.CaptureRecord{}
	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", Name: "Phone", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		AnimeWrite:    stubWebSocketAnimeWrite{err: context.DeadlineExceeded},
		SyncTrigger:   stubSyncService{},
		Capture: func(record mobilecapture.CaptureRecord) bool {
			captures = append(captures, record)
			return true
		},
	})
	defer cleanup()

	conn := dialWebSocketWithToken(t, wsURL, "good-token")
	defer closeWebsocket(t, conn)
	readControlMessage(t, conn)
	if err := conn.WriteJSON(map[string]any{"type": "reconcile", "last_changelog_id": 7, "pending_operations": []map[string]any{{"anime_id": "anime-1", "operation": "update", "payload": map[string]any{"episodesWatched": 3}, "created_at": 1710000000123}}}); err != nil {
		t.Fatalf("write websocket reconcile: %v", err)
	}
	waitForCaptureCount(t, &captures, 1)
	if captures[0].Outcome != "rejected" {
		t.Fatalf("unexpected outcome %#v", captures[0])
	}
	if captures[0].DurationMS == nil {
		t.Fatal("expected duration_ms to be captured")
	}
	if captures[0].ResponseBody == nil {
		t.Fatal("expected response body to be captured for a rejected ws reconcile")
	}
}

func TestWSNonReconcileNoCapture(t *testing.T) {
	t.Parallel()

	captures := []mobilecapture.CaptureRecord{}
	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", Name: "Phone", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		Capture: func(record mobilecapture.CaptureRecord) bool {
			captures = append(captures, record)
			return true
		},
	})
	defer cleanup()

	conn := dialWebSocketWithToken(t, wsURL, "good-token")
	defer closeWebsocket(t, conn)
	readControlMessage(t, conn)
	if err := conn.WriteJSON(map[string]any{"type": "noop"}); err != nil {
		t.Fatalf("write websocket noop: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if len(captures) != 0 {
		t.Fatalf("expected no capture for non-reconcile traffic, got %#v", captures)
	}
}

func TestWSMalformedNoCapture(t *testing.T) {
	t.Parallel()

	captures := []mobilecapture.CaptureRecord{}
	_, wsURL, cleanup := newWebsocketTestServer(t, Config{
		DeviceService: stubDeviceService{authenticated: device.PairedDevice{DeviceID: "device-1", Name: "Phone", AuthToken: "good-token"}},
		RealtimeHub:   realtime.NewMemoryHub(context.Background(), realtime.MemoryHubConfig{}),
		Capture: func(record mobilecapture.CaptureRecord) bool {
			captures = append(captures, record)
			return true
		},
	})
	defer cleanup()

	conn := dialWebSocketWithToken(t, wsURL, "good-token")
	defer closeWebsocket(t, conn)
	readControlMessage(t, conn)
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{`)); err != nil {
		t.Fatalf("write malformed websocket message: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if len(captures) != 0 {
		t.Fatalf("expected no capture for malformed websocket payload, got %#v", captures)
	}
}
