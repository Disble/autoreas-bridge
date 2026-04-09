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

func TestDecodePendingOperationPatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		op      contracts.PendingOperation
		want    AnimePatch
		wantErr string
	}{
		{
			name: "maps valid payload",
			op: contracts.PendingOperation{
				AnimeID:   "anime-1",
				Operation: "update",
				Payload: map[string]any{
					"estado":           float64(2),
					"nrocapvisto":      float64(10.5),
					"fechaUltCapVisto": float64(1710000000123),
					"dias":             []any{"Lunes", "Miercoles"},
				},
			},
			want: AnimePatch{Estado: intPtr(2), NroCapVisto: floatPtr(10.5), FechaUltCapVisto: int64Ptr(1710000000123), Dias: []string{"Lunes", "Miercoles"}},
		},
		{
			name: "rejects missing anime id",
			op: contracts.PendingOperation{
				Operation: "update",
				Payload:   map[string]any{"nrocapvisto": float64(1)},
			},
			wantErr: "missing anime id",
		},
		{
			name: "rejects invalid payload",
			op: contracts.PendingOperation{
				AnimeID:   "anime-1",
				Operation: "update",
				Payload:   map[string]any{"nrocapvisto": -1},
			},
			wantErr: "invalid nrocapvisto",
		},
	}

	for _, tt := range tests {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := decodePendingOperationPatch(tc.op)
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("decode pending operation patch: %v", err)
			}
			if !equalAnimePatch(got, tc.want) {
				t.Fatalf("expected patch %#v, got %#v", tc.want, got)
			}
		})
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

func equalAnimePatch(got AnimePatch, want AnimePatch) bool {
	if !equalIntPointers(got.Estado, want.Estado) {
		return false
	}
	if !equalFloatPointers(got.NroCapVisto, want.NroCapVisto) {
		return false
	}
	if !equalInt64Pointers(got.FechaUltCapVisto, want.FechaUltCapVisto) {
		return false
	}
	if len(got.Dias) != len(want.Dias) {
		return false
	}
	for index := range got.Dias {
		if got.Dias[index] != want.Dias[index] {
			return false
		}
	}
	return true
}

func equalIntPointers(got *int, want *int) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func equalFloatPointers(got *float64, want *float64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func intPtr(value int) *int {
	return &value
}

func floatPtr(value float64) *float64 {
	return &value
}

func equalInt64Pointers(got *int64, want *int64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func int64Ptr(value int64) *int64 {
	return &value
}
