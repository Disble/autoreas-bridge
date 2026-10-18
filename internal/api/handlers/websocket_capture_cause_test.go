package handlers

import (
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/device"
)

// TestWSTerminalCaptureKeepsTheRejectionCause guards P1 on the WebSocket path:
// the error a rejected reconcile already carries is stored as its cause, and an
// accepted message stores none.
func TestWSTerminalCaptureKeepsTheRejectionCause(t *testing.T) {
	t.Parallel()

	rejected := buildWSTerminalCaptureRecord("req-1", time.Now(), incomingWebSocketMessage{}, device.PairedDevice{},
		rejectedWSOutcome("invalid_reconcile", nil, errors.New("pending operation 3 has no anime id")), nil)
	if rejected.ErrorMessage != "pending operation 3 has no anime id" {
		t.Fatalf("rejected error message = %q", rejected.ErrorMessage)
	}

	accepted := buildWSTerminalCaptureRecord("req-2", time.Now(), incomingWebSocketMessage{}, device.PairedDevice{},
		wsMessageOutcome{outcome: "accepted"}, nil)
	if accepted.ErrorMessage != "" {
		t.Fatalf("accepted error message = %q, want empty", accepted.ErrorMessage)
	}
}
