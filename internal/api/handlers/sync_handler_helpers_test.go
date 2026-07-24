package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/mobilecapture"
)

func TestCaptureFailureAuxOnly(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{captureShouldFail: true}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		Capture:      stubs.capture,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"last_changelog_id":0,"pending_operations":[]}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected canonical accepted status, got %d", res.Code)
	}
}

func TestReconcileCapturesResponseBodyOnReject(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate:      stubs.authenticate(true),
		ApplyPendingPatch: stubs.patchAnime,
		Capture:           stubs.capture,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected malformed request status, got %d", res.Code)
	}
	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	record := stubs.captures[0]
	if record.DurationMS == nil {
		t.Fatal("expected duration_ms to be captured")
	}
	if record.ResponseBody == nil {
		t.Fatal("expected response body to be captured for a rejected reconcile")
	}
}

func TestCaptureFailureLeavesTelemetryNullAuxOnly(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{captureShouldFail: true}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate:      stubs.authenticate(true),
		ApplyPendingPatch: stubs.patchAnime,
		Capture:           stubs.capture,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"last_changelog_id":0,"pending_operations":[]}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected canonical accepted status even when capture write fails, got %d", res.Code)
	}
	if len(stubs.captures) != 1 {
		t.Fatalf("expected the capture attempt to still be recorded by the stub, got %#v", stubs.captures)
	}
}

// syncHandlerStubs provides test dependencies for the sync handler.
type syncHandlerStubs struct {
	triggerCalls      int
	captures          []mobilecapture.CaptureRecord
	captureShouldFail bool
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

// capture records the capture record and returns whether it should succeed.
func (s *syncHandlerStubs) capture(record mobilecapture.CaptureRecord) bool {
	s.captures = append(s.captures, record)
	return !s.captureShouldFail
}
