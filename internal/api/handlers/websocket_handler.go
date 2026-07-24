package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/mobilecapture"
	"autoreas-bridge/internal/realtime"
	"github.com/gorilla/websocket"
)

// wsCaptureErrorCodes maps a WS reconcile rejection reason to the small
// synthetic error payload sanitized and persisted as response_body. WebSocket
// reconcile is fire-and-forget (no ack frame reaches the client), so this
// payload represents the rejection reason the server would otherwise convey.
func wsRejectResponseBody(errorCode string) *string {
	payload, err := json.Marshal(map[string]string{"error": errorCode})
	if err != nil {
		return nil
	}
	return mobilecapture.SanitizeResponseBody(payload)
}

// WebSocketHandlerConfig wires the dependencies required by the realtime socket adapter.
type WebSocketHandlerConfig struct {
	Authenticate       AuthenticateFunc
	ApplyPendingPatch  PatchAnimeFunc
	TriggerReconcile   TriggerReconcileFunc
	AcknowledgeDevice  AcknowledgeDeviceFunc
	RecordSeasonRating RecordSeasonRatingFunc
	Capture            CaptureFunc
	Hub                realtime.Hub
	Logger             sharedlogger.Logger
}

var websocketClientSequence uint64

// NewWebSocketHandler builds the WebSocket transport adapter used by mobile clients.
func NewWebSocketHandler(config WebSocketHandlerConfig) http.Handler {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool { return true },
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handleWebSocketConnection(w, r, config, upgrader)
	})
}

// handleWebSocketConnection authenticates, upgrades, and serves one websocket client.
func handleWebSocketConnection(w http.ResponseWriter, r *http.Request, config WebSocketHandlerConfig, upgrader websocket.Upgrader) {
	if config.Authenticate == nil || config.Hub == nil {
		http.Error(w, "websocket unavailable", http.StatusServiceUnavailable)
		return
	}
	device, ok := config.Authenticate(w, r)
	if !ok {
		return
	}
	connHeaders := mobilecapture.SanitizeHeaders(r.Header)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client, ok := registerWebSocketClient(r.Context(), device.DeviceID, conn, config)
	if !ok {
		return
	}
	defer config.Hub.Unregister(client.ID())
	serveWebSocketMessages(r.Context(), device, conn, config, connHeaders)
}

// registerWebSocketClient registers a websocket client with the realtime hub.
func registerWebSocketClient(ctx context.Context, deviceID string, conn *websocket.Conn, config WebSocketHandlerConfig) (*webSocketClient, bool) {
	client := newWebSocketClient(deviceID, conn)
	if err := config.Hub.Register(ctx, client); err != nil {
		if config.Logger != nil {
			config.Logger.Errorf("websocket", "failed to register websocket client for %s: %v", deviceID, err)
		}
		_ = conn.Close()
		return nil, false
	}
	if config.Logger != nil {
		config.Logger.Infof("websocket", "registered websocket client for %s", deviceID)
	}
	return client, true
}

// serveWebSocketMessages reads and dispatches messages until the connection closes.
func serveWebSocketMessages(ctx context.Context, device device.PairedDevice, conn *websocket.Conn, config WebSocketHandlerConfig, connHeaders map[string]string) {
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if err := handleIncomingWebSocketMessage(ctx, device, payload, config, connHeaders); err != nil && config.Logger != nil {
			config.Logger.Warnf("websocket incoming message failed for %s: %v", device.DeviceID, err)
		}
	}
}

type incomingWebSocketMessage struct {
	Type string `json:"type"`
	contracts.ReconcileRequest
	// Season-rating fields (SDD-44), present only on a "season_rating" message.
	AnimeID string `json:"anime_id"`
	Grade   int    `json:"grade"`
	RatedAt int64  `json:"rated_at"`
}

// handleIncomingWebSocketMessage decodes and processes one client message.
func handleIncomingWebSocketMessage(ctx context.Context, device device.PairedDevice, payload []byte, config WebSocketHandlerConfig, connHeaders map[string]string) error {
	start := time.Now()
	var message incomingWebSocketMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return nil
	}

	// A season_rating message is fire-and-forget: no ack, no reconcile; the
	// confirmation reaches clients via the season_changed broadcast.
	if message.Type == "season_rating" {
		if config.RecordSeasonRating == nil {
			return nil
		}
		_, err := config.RecordSeasonRating(ctx, message.AnimeID, message.Grade, message.RatedAt)
		return err
	}

	if !isIncomingReconcileMessage(message) {
		return nil
	}

	captureWSTelemetry := func(record mobilecapture.CaptureRecord, errorCode string) mobilecapture.CaptureRecord {
		duration := time.Since(start).Milliseconds()
		telemetry := mobilecapture.Telemetry{DurationMS: &duration, RequestHeaders: connHeaders}
		if errorCode != "" {
			telemetry.ResponseBody = wsRejectResponseBody(errorCode)
		}
		return record.WithTelemetry(telemetry)
	}

	results, err := applyPendingOperations(ctx, message.PendingOperations, config.ApplyPendingPatch)
	if err != nil {
		record := captureWSTelemetry(mobilecapture.BuildReconcileCaptureRecord(device, "ws_reconcile", "/ws", "websocket", message.ReconcileRequest, "rejected", nil, "apply_pending_failed", operationRefsFromAppliedOperations(results), nil), "apply_pending_failed")
		enqueueWebSocketCapture(config.Capture, record)
		return err
	}
	if config.AcknowledgeDevice != nil {
		if err := config.AcknowledgeDevice(ctx, device.DeviceID, message.LastChangelogID); err != nil {
			record := captureWSTelemetry(mobilecapture.BuildReconcileCaptureRecord(device, "ws_reconcile", "/ws", "websocket", message.ReconcileRequest, "rejected", nil, "acknowledge_device_failed", operationRefsFromAppliedOperations(results), nil), "acknowledge_device_failed")
			enqueueWebSocketCapture(config.Capture, record)
			return err
		}
	}
	if config.TriggerReconcile != nil {
		if err := config.TriggerReconcile(ctx); err != nil {
			record := captureWSTelemetry(mobilecapture.BuildReconcileCaptureRecord(device, "ws_reconcile", "/ws", "websocket", message.ReconcileRequest, "rejected", nil, "trigger_reconcile_failed", operationRefsFromAppliedOperations(results), nil), "trigger_reconcile_failed")
			enqueueWebSocketCapture(config.Capture, record)
			return err
		}
	}
	record := captureWSTelemetry(mobilecapture.BuildReconcileCaptureRecord(device, "ws_reconcile", "/ws", "websocket", message.ReconcileRequest, "accepted", nil, "", operationRefsFromAppliedOperations(results), nil), "")
	enqueueWebSocketCapture(config.Capture, record)
	return nil
}

// enqueueWebSocketCapture enqueues a WebSocket observability record when capture is configured.
func enqueueWebSocketCapture(capture CaptureFunc, record mobilecapture.CaptureRecord) {
	if capture != nil {
		capture(record)
	}
}

// isIncomingReconcileMessage identifies messages that request reconciliation.
func isIncomingReconcileMessage(message incomingWebSocketMessage) bool {
	if len(message.PendingOperations) == 0 {
		return message.Type == "reconcile"
	}
	if message.Type == "" {
		return true
	}
	return message.Type == "reconcile"
}

type webSocketClient struct {
	id   string
	conn *websocket.Conn
	mu   sync.Mutex
}

// newWebSocketClient creates a uniquely identified websocket hub client.
func newWebSocketClient(deviceID string, conn *websocket.Conn) *webSocketClient {
	sequence := atomic.AddUint64(&websocketClientSequence, 1)
	return &webSocketClient{
		id:   fmt.Sprintf("%s-%d", deviceID, sequence),
		conn: conn,
	}
}

func (c *webSocketClient) ID() string {
	return c.id
}

func (c *webSocketClient) Send(ctx context.Context, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if deadline, ok := ctx.Deadline(); ok {
		if err := c.conn.SetWriteDeadline(deadline); err != nil {
			return err
		}
	} else {
		if err := c.conn.SetWriteDeadline(time.Time{}); err != nil {
			return err
		}
	}

	return c.conn.WriteMessage(websocket.TextMessage, payload)
}

func (c *webSocketClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.Close()
}
