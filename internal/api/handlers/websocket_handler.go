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
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
	"github.com/gorilla/websocket"
)

type WebSocketHandlerConfig struct {
	Authenticate       AuthenticateFunc
	ApplyPendingPatch  PatchAnimeFunc
	TriggerReconcile   TriggerReconcileFunc
	AcknowledgeDevice  AcknowledgeDeviceFunc
	RecordSeasonRating RecordSeasonRatingFunc
	Hub                realtime.Hub
	Logger             sharedlogger.Logger
}

var websocketClientSequence uint64

func NewWebSocketHandler(config WebSocketHandlerConfig) http.Handler {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool { return true },
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.Authenticate == nil || config.Hub == nil {
			http.Error(w, "websocket unavailable", http.StatusServiceUnavailable)
			return
		}

		device, ok := config.Authenticate(w, r)
		if !ok {
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		client := newWebSocketClient(device.DeviceID, conn)
		if err := config.Hub.Register(r.Context(), client); err != nil {
			if config.Logger != nil {
				config.Logger.Errorf("websocket", "failed to register websocket client for %s: %v", device.DeviceID, err)
			}
			_ = conn.Close()
			return
		}
		if config.Logger != nil {
			config.Logger.Infof("websocket", "registered websocket client for %s", device.DeviceID)
		}
		defer config.Hub.Unregister(client.ID())

		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if err := handleIncomingWebSocketMessage(r.Context(), device.DeviceID, payload, config); err != nil && config.Logger != nil {
				config.Logger.Warnf("websocket incoming message failed for %s: %v", device.DeviceID, err)
			}
		}
	})
}

type incomingWebSocketMessage struct {
	Type string `json:"type"`
	contracts.ReconcileRequest
	// Season-rating fields (SDD-44), present only on a "season_rating" message.
	AnimeID string `json:"anime_id"`
	Grade   int    `json:"grade"`
	RatedAt int64  `json:"rated_at"`
}

func handleIncomingWebSocketMessage(ctx context.Context, deviceID string, payload []byte, config WebSocketHandlerConfig) error {
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

	if _, err := applyPendingOperations(ctx, message.PendingOperations, config.ApplyPendingPatch); err != nil {
		return err
	}
	if config.AcknowledgeDevice != nil {
		if err := config.AcknowledgeDevice(ctx, deviceID, message.LastChangelogID); err != nil {
			return err
		}
	}
	if config.TriggerReconcile != nil {
		return config.TriggerReconcile(ctx)
	}
	return nil
}

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
