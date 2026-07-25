package handlers

import (
	"context"
	"net/http"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

// Transport-level telemetry (duration_ms, response headers/body, http_status)
// now belongs entirely to internal/api's CaptureMiddleware -- see
// TestCaptureMiddlewareCapturesResponseBodyOnNon2xx in
// internal/api/capture_middleware_test.go. NewSyncHandler no longer takes a
// Capture dependency at all: it only contributes semantic facts to
// requestcapture.Enrich(r.Context()), so there is nothing left for a
// capture-write-failure test to exercise at this layer.

// syncHandlerStubs provides test dependencies for the sync handler.
type syncHandlerStubs struct {
	triggerCalls int
}

// authenticate returns a test authentication function with the requested result.
func (s *syncHandlerStubs) authenticate(authorized bool) AuthenticateFunc {
	return func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
		if !authorized {
			writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
			return device.PairedDevice{}, false
		}

		return device.PairedDevice{DeviceID: "device-1"}, true
	}
}

// patchAnime returns a successful applied result for sync handler tests.
func (s *syncHandlerStubs) patchAnime(_ context.Context, id string, patch AnimePatch) (contracts.AnimePatchResult, error) {
	return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
}
