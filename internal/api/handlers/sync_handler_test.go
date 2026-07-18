package handlers

import (
	"context"
	"encoding/json"
	"errors"
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
	if payload.LastChangelogID != 1 {
		t.Fatalf("expected last changelog id 1, got %d", payload.LastChangelogID)
	}
	if len(payload.AppliedOperations) != 0 {
		t.Fatalf("expected no applied operations for empty reconcile, got %#v", payload.AppliedOperations)
	}
}

func TestSyncHandlerAcknowledgesAuthenticatedDeviceCheckpointBeforeListingChanges(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	var ackDeviceID string
	var ackLastID int64
	var listLastID int64
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		AcknowledgeDevice: func(_ context.Context, deviceID string, lastChangelogID int64) error {
			ackDeviceID = deviceID
			ackLastID = lastChangelogID
			return nil
		},
		ListChangesAfterID: func(_ context.Context, lastID int64) ([]AnimeChange, int64, error) {
			listLastID = lastID
			return nil, lastID, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"spoofed-device","last_changelog_id":42,"pending_operations":[]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
	}
	if ackDeviceID != "device-1" {
		t.Fatalf("expected ack to use authenticated device id, got %q", ackDeviceID)
	}
	if ackLastID != 42 {
		t.Fatalf("expected ack last id 42, got %d", ackLastID)
	}
	if listLastID != 42 {
		t.Fatalf("expected list after same client checkpoint 42, got %d", listLastID)
	}
}

func TestSyncHandlerReturnsServerErrorWhenDeviceAckFails(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		AcknowledgeDevice: func(context.Context, string, int64) error {
			return errors.New("sqlite failed")
		},
		ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) {
			t.Fatal("did not expect changes to be listed after ack failure")
			return nil, 0, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":42,"pending_operations":[]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, res.Code)
	}
}

func TestSyncHandlerAppliesPendingUpdateOperationsBeforeReturning(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	var patchedID string
	var patchedPatch AnimePatch
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		TriggerReconcile: func(context.Context) error {
			stubs.triggerCalls++
			return nil
		},
		ApplyPendingPatch: func(_ context.Context, id string, patch AnimePatch) error {
			patchedID = id
			patchedPatch = patch
			return nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"nrocapvisto":664,"fechaUltCapVisto":1710000000123},"created_at":1710000000123}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusAccepted, res.Code, res.Body.String())
	}

	if patchedID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", patchedID)
	}
	if patchedPatch.NroCapVisto == nil || *patchedPatch.NroCapVisto != 664 {
		t.Fatalf("expected nrocapvisto 664, got %#v", patchedPatch.NroCapVisto)
	}
	if patchedPatch.FechaUltCapVisto == nil || *patchedPatch.FechaUltCapVisto != 1710000000123 {
		t.Fatalf("expected fechaUltCapVisto 1710000000123, got %#v", patchedPatch.FechaUltCapVisto)
	}
	if stubs.triggerCalls != 1 {
		t.Fatalf("expected reconcile trigger once, got %d calls", stubs.triggerCalls)
	}

	var payload ReconcileResponse
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.AppliedOperations) != 1 {
		t.Fatalf("expected 1 applied operation, got %#v", payload.AppliedOperations)
	}
	applied := payload.AppliedOperations[0]
	if applied.AnimeID != "anime-1" || applied.Operation != "update" || !applied.Applied {
		t.Fatalf("unexpected applied operation %#v", applied)
	}
}

func TestSyncHandlerReturnsBadRequestWhenPendingOperationIsInvalid(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		TriggerReconcile: func(context.Context) error {
			stubs.triggerCalls++
			return nil
		},
		ApplyPendingPatch: func(context.Context, string, AnimePatch) error {
			t.Fatal("did not expect pending patch application")
			return nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"nrocapvisto":-1},"created_at":1710000000123}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
	}
	if stubs.triggerCalls != 0 {
		t.Fatalf("expected reconcile trigger not to be called, got %d calls", stubs.triggerCalls)
	}
}

func TestSyncHandlerReturnsServerErrorWhenApplyingPendingOperationFails(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		TriggerReconcile: func(context.Context) error {
			stubs.triggerCalls++
			return nil
		},
		ApplyPendingPatch: func(context.Context, string, AnimePatch) error {
			return errors.New("append failed")
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"nrocapvisto":664},"created_at":1710000000123}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusInternalServerError, res.Code, res.Body.String())
	}
	if stubs.triggerCalls != 0 {
		t.Fatalf("expected reconcile trigger not to be called, got %d calls", stubs.triggerCalls)
	}
}

func TestSyncHandlerIgnoresNonUpdatePendingOperations(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	called := false
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		TriggerReconcile: func(context.Context) error {
			stubs.triggerCalls++
			return nil
		},
		ApplyPendingPatch: func(context.Context, string, AnimePatch) error {
			called = true
			return nil
		},
		ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) {
			return []AnimeChange{{RecordID: "anime-1", ChangeType: "update", Timestamp: 123}}, 1, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"delete","payload":{},"created_at":1710000000123}]}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, res.Code)
	}
	if called {
		t.Fatal("did not expect non-update operation to call ApplyPendingPatch")
	}

	var payload ReconcileResponse
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.AppliedOperations) != 1 {
		t.Fatalf("expected 1 applied operation result, got %#v", payload.AppliedOperations)
	}
	applied := payload.AppliedOperations[0]
	if applied.AnimeID != "anime-1" || applied.Operation != "delete" || applied.Applied {
		t.Fatalf("expected unapplied delete marker, got %#v", applied)
	}
}

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
