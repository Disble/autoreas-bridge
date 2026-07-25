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
	"github.com/google/uuid"
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

// handleIncomingWebSocketMessage decodes and dispatches one client message.
// Capture only ever brackets a reconcile message (isIncomingReconcileMessage):
// season_rating is fire-and-forget (no ack, no reconcile -- confirmation
// reaches clients via the season_changed broadcast) and any other frame type
// is a silent no-op, both uncaptured.
func handleIncomingWebSocketMessage(ctx context.Context, device device.PairedDevice, payload []byte, config WebSocketHandlerConfig, connHeaders map[string]string) error {
	var message incomingWebSocketMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return nil
	}

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

	return captureWebSocketMessage(ctx, device, message, config, connHeaders)
}

// captureWebSocketMessage brackets one reconcile message with capture: it
// mints the request id once, enqueues a pending arrival row, runs the pure
// reconcile business logic (applyReconcileMessage), then enqueues the
// terminal row sharing the same request id (Store.UpsertCapture upserts it
// in place). Mirrors the HTTP capture middleware's arrival→terminal shape
// for the WS transport, which has no middleware layer of its own.
func captureWebSocketMessage(ctx context.Context, device device.PairedDevice, message incomingWebSocketMessage, config WebSocketHandlerConfig, connHeaders map[string]string) error {
	requestID := uuid.NewString()
	startedAt := time.Now()
	enqueueWebSocketCapture(config.Capture, mobilecapture.BuildTransportCaptureRecord(requestID, startedAt.UnixMilli(), "ws_reconcile", "/ws", "websocket"))

	outcome := applyReconcileMessage(ctx, device, message, config)

	enqueueWebSocketCapture(config.Capture, buildWSTerminalCaptureRecord(requestID, startedAt, message, device, outcome, connHeaders))
	return outcome.err
}

// wsMessageOutcome is the structured result of processing one incoming
// reconcile message: the semantic facts captureWebSocketMessage needs to
// build the terminal capture row, decoupled from capture concerns so
// applyReconcileMessage stays pure business logic.
type wsMessageOutcome struct {
	outcome      string
	errorCode    string
	correlations mobilecapture.Correlations
	err          error
}

// applyReconcileMessage applies one reconcile message's pending operations,
// acknowledges the device, and triggers a reconcile fan-out, reporting the
// structured outcome. It performs no capture enqueue -- that is
// captureWebSocketMessage's sole responsibility.
func applyReconcileMessage(ctx context.Context, device device.PairedDevice, message incomingWebSocketMessage, config WebSocketHandlerConfig) wsMessageOutcome {
	results, err := applyPendingOperations(ctx, message.PendingOperations, config.ApplyPendingPatch)
	if err != nil {
		return rejectedWSOutcome("apply_pending_failed", results, err)
	}
	if config.AcknowledgeDevice != nil {
		if err := config.AcknowledgeDevice(ctx, device.DeviceID, message.LastChangelogID); err != nil {
			return rejectedWSOutcome("acknowledge_device_failed", results, err)
		}
	}
	if config.TriggerReconcile != nil {
		if err := config.TriggerReconcile(ctx); err != nil {
			return rejectedWSOutcome("trigger_reconcile_failed", results, err)
		}
	}
	return wsMessageOutcome{
		outcome:      "accepted",
		correlations: mobilecapture.Correlations{OperationRefs: operationRefsFromAppliedOperations(results)},
	}
}

// rejectedWSOutcome builds the rejected wsMessageOutcome shared by every
// applyReconcileMessage failure branch.
func rejectedWSOutcome(errorCode string, results []contracts.AppliedOperation, err error) wsMessageOutcome {
	return wsMessageOutcome{
		outcome:      "rejected",
		errorCode:    errorCode,
		correlations: mobilecapture.Correlations{OperationRefs: operationRefsFromAppliedOperations(results)},
		err:          err,
	}
}

// buildWSTerminalCaptureRecord assembles the terminal WS reconcile capture
// row: the same transport-only shape as the arrival row (same request id),
// merged with device identity, elapsed duration, sanitized connection
// headers, the reconcile payload projection, and the outcome/error_code/
// correlations applyReconcileMessage reported.
func buildWSTerminalCaptureRecord(requestID string, startedAt time.Time, message incomingWebSocketMessage, device device.PairedDevice, outcome wsMessageOutcome, connHeaders map[string]string) mobilecapture.CaptureRecord {
	record := mobilecapture.BuildTransportCaptureRecord(requestID, startedAt.UnixMilli(), "ws_reconcile", "/ws", "websocket")
	duration := time.Since(startedAt).Milliseconds()
	record.DurationMS = &duration
	record.RequestHeaders = connHeaders
	record.Device = mobilecapture.DeviceIdentity{DeviceID: device.DeviceID, Name: device.Name}
	record.Outcome = outcome.outcome
	record.ErrorCode = outcome.errorCode
	record.Payload = mobilecapture.ReconcilePayload(message.ReconcileRequest)
	record.Correlations = outcome.correlations
	if outcome.errorCode != "" {
		record.ResponseBody = wsRejectResponseBody(outcome.errorCode)
	}
	return record
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
