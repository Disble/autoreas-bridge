package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
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

func TestReconcileAcceptedCapture(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate:      stubs.authenticate(true),
		ApplyPendingPatch: stubs.patchAnime,
		Capture:           stubs.capture,
		ListChangesAfterID: func(context.Context, int64) ([]AnimeChange, int64, error) {
			return []AnimeChange{{ID: 9, RecordID: "anime-1", ChangeType: "update", Timestamp: 123}}, 9, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"spoofed","last_changelog_id":8,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":3},"created_at":1710000000123}]}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, res.Code)
	}
	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	if stubs.captures[0].Outcome != "accepted" {
		t.Fatalf("expected accepted capture, got %#v", stubs.captures[0])
	}
	if stubs.captures[0].Device.DeviceID != "device-1" {
		t.Fatalf("expected trusted device id, got %#v", stubs.captures[0].Device)
	}
}

func TestReconcileRejectedCapture(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{
		Authenticate: stubs.authenticate(true),
		ApplyPendingPatch: func(_ context.Context, id string, _ AnimePatch) (contracts.AnimePatchResult, error) {
			if id == "anime-1" {
				return contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeApplied}, nil
			}
			return contracts.AnimePatchResult{}, errors.New("boom")
		},
		Capture: stubs.capture,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"last_changelog_id":8,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":3}},{"anime_id":"anime-2","operation":"update","payload":{"episodesWatched":4}}]}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status %d, got %d", http.StatusInternalServerError, res.Code)
	}
	if len(stubs.captures) != 1 || stubs.captures[0].Outcome != "rejected" {
		t.Fatalf("expected rejected capture, got %#v", stubs.captures)
	}
	if refs := stubs.captures[0].Correlations.OperationRefs; len(refs) != 1 || refs[0].AnimeID != "anime-1" {
		t.Fatalf("expected successful partial operation reference, got %#v", refs)
	}
}

func TestReconcileRejectsOversizedBodyWithoutOversizedCapture(t *testing.T) {
	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{Authenticate: stubs.authenticate(true), Capture: stubs.capture})
	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"pending_operations":[],"padding":"`+strings.Repeat("x", 1<<20)+`"}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || len(stubs.captures) != 1 || len(stubs.captures[0].Payload) > 2 {
		t.Fatalf("expected bounded malformed capture, status=%d captures=%#v", res.Code, stubs.captures)
	}
}

func TestReconcileMalformedCapture(t *testing.T) {
	t.Parallel()

	stubs := &syncHandlerStubs{}
	handler := NewSyncHandler(SyncHandlerConfig{Authenticate: stubs.authenticate(true), Capture: stubs.capture})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
	}
	if len(stubs.captures) != 1 || stubs.captures[0].Outcome != "malformed" {
		t.Fatalf("expected malformed capture, got %#v", stubs.captures)
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
		ApplyPendingPatch: func(_ context.Context, id string, patch AnimePatch) (contracts.AnimePatchResult, error) {
			patchedID = id
			patchedPatch = patch
			return contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":664,"lastWatchedAt":1710000000123},"created_at":1710000000123}]}`))
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
		ApplyPendingPatch: func(context.Context, string, AnimePatch) (contracts.AnimePatchResult, error) {
			t.Fatal("did not expect pending patch application")
			return contracts.AnimePatchResult{}, nil
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":-1},"created_at":1710000000123}]}`))
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
		ApplyPendingPatch: func(context.Context, string, AnimePatch) (contracts.AnimePatchResult, error) {
			return contracts.AnimePatchResult{}, errors.New("append failed")
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":664},"created_at":1710000000123}]}`))
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
		ApplyPendingPatch: func(context.Context, string, AnimePatch) (contracts.AnimePatchResult, error) {
			called = true
			return contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
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
