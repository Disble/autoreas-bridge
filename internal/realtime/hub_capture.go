package realtime

import (
	"strings"
	"time"

	"autoreas-bridge/internal/observability/requestcapture"

	"github.com/google/uuid"
)

// Capture kinds recorded at the hub's single fan-out point (design.md
// "Hub capture sink"). ws_connect/ws_disconnect cover the client lifecycle;
// ws_broadcast covers every outbound push (anime/preferences/season).
const (
	captureKindWSConnect    = "ws_connect"
	captureKindWSDisconnect = "ws_disconnect"
	captureKindWSBroadcast  = "ws_broadcast"
)

// captureHubConnect records a client registration as a one-way ws_connect/
// opened row. A nil sink is a safe no-op.
func captureHubConnect(capture requestcapture.CaptureFunc, clientID string) {
	captureHubFrame(capture, captureKindWSConnect, "opened", clientID, nil, nil)
}

// captureHubDisconnect records a client removal as a one-way ws_disconnect/
// closed row. A nil sink is a safe no-op.
func captureHubDisconnect(capture requestcapture.CaptureFunc, clientID string) {
	captureHubFrame(capture, captureKindWSDisconnect, "closed", clientID, nil, nil)
}

// captureHubBroadcast records one outbound fan-out frame as a one-way
// ws_broadcast/pushed row: no request/response shape (nil http status and
// duration), animeID set only for anime-scoped broadcasts, payload carries
// the frame's own fields. A nil sink is a safe no-op.
func captureHubBroadcast(capture requestcapture.CaptureFunc, animeID *string, payload map[string]any) {
	captureHubFrame(capture, captureKindWSBroadcast, "pushed", "", animeID, payload)
}

// captureHubFrame enqueues one hub-owned capture row best-effort. The actual
// call into capture runs on its own goroutine so a slow or blocking sink
// (in production, capture is expected to be a non-blocking TryEnqueue, but
// this guarantee must hold regardless) never delays the hub's own
// register/unregister/broadcast fan-out goroutines. A nil sink
// (MemoryHubConfig.Capture unset) is a safe no-op.
func captureHubFrame(capture requestcapture.CaptureFunc, kind, outcome, clientID string, animeID *string, payload map[string]any) {
	if capture == nil {
		return
	}
	record := requestcapture.BuildTransportCaptureRecord(uuid.NewString(), time.Now().UnixMilli(), kind, "/ws", "websocket")
	record.Outcome = outcome
	if clientID != "" {
		record.Device = requestcapture.DeviceIdentity{DeviceID: deviceIDFromClientID(clientID)}
	}
	record.AnimeID = animeID
	record.Payload = payload
	go capture(record)
}

// deviceIDFromClientID recovers the paired device id from a hub client id
// ("<deviceID>-<sequence>", newWebSocketClient's shape in
// internal/api/handlers/websocket_handler.go). Client exposes only ID(), so
// the device name is not recoverable here -- a known fidelity gap (see
// design.md "Drift"): hub capture rows always carry a blank device name.
func deviceIDFromClientID(clientID string) string {
	if idx := strings.LastIndex(clientID, "-"); idx > 0 {
		return clientID[:idx]
	}
	return clientID
}
