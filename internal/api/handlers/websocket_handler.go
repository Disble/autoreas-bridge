package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"autoreas-bridge/internal/realtime"
	"github.com/gorilla/websocket"
)

type WebSocketHandlerConfig struct {
	Authenticate AuthenticateFunc
	Hub          realtime.Hub
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
			_ = conn.Close()
			return
		}
		defer config.Hub.Unregister(client.ID())

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	})
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
