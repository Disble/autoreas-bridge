package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/device"
)

func TestSyncHandlerReturnsUnauthorizedWithoutBearer(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(false),
		TriggerReconcile: func(context.Context) error {
			stubs.triggerCalls++
			return nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", nil)
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.Code)
	}

	if stubs.triggerCalls != 0 {
		t.Fatalf("expected reconcile trigger not to be called, got %d calls", stubs.triggerCalls)
	}
}

func TestSyncHandlerReturnsAccepted(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		TriggerReconcile: func(context.Context) error {
			stubs.triggerCalls++
			return nil
		},
		ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) {
			return []AnimeChange{{RecordID: "anime-1", ChangeType: "update", Timestamp: 123}}, 1, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, res.Code)
	}

	if stubs.triggerCalls != 1 {
		t.Fatalf("expected reconcile trigger once, got %d calls", stubs.triggerCalls)
	}

	var payload ReconcileResponse
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Status != "accepted" || len(payload.BridgeChanges) != 1 {
		t.Fatalf("unexpected reconcile response %#v", payload)
	}
}

type syncHandlerStubs struct {
	triggerCalls int
}

func (s *syncHandlerStubs) authenticate(authorized bool) AuthenticateFunc {
	return func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
		if !authorized {
			writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
			return device.PairedDevice{}, false
		}

		return device.PairedDevice{DeviceID: "device-1"}, true
	}
}
