package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/requestcapture"
)

// SyncHandlerConfig wires the dependencies required by the sync reconcile handler.
type SyncHandlerConfig struct {
	Authenticate       AuthenticateFunc
	ApplyPendingPatch  PatchAnimeFunc
	TriggerReconcile   TriggerReconcileFunc
	ListChangesAfterID ListChangesAfterIDFunc
	AcknowledgeDevice  AcknowledgeDeviceFunc
}

// NewSyncHandler builds the POST /api/sync/reconcile transport adapter. It is
// transport-free: request timing, status, headers, and body capture belong
// to the CaptureMiddleware wrapping this handler (internal/api). Each exit
// point contributes semantic facts via requestcapture.Enrich(r.Context()) --
// the middleware's terminal defer merges them onto the transport record.
func NewSyncHandler(config SyncHandlerConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enr := requestcapture.Enrich(r.Context())

		pairedDevice, ok := authenticateSyncRequest(w, r, config.Authenticate)
		if !ok {
			return
		}
		enr.SetDevice(pairedDevice)
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		}
		req, ok := decodeReconcileRequest(w, r)
		if !ok {
			enr.SetOutcome("malformed").SetErrorCode("invalid_request_body").SetPayload(requestcapture.ReconcilePayload(ReconcileRequest{}))
			return
		}
		appliedOperations, ok := applyReconcileOperations(w, r.Context(), req.PendingOperations, config.ApplyPendingPatch)
		if !ok {
			enrichReconcileRejection(enr, req, "apply_pending_failed", appliedOperations)
			return
		}
		if !triggerReconcile(w, r.Context(), config.TriggerReconcile) {
			enrichReconcileRejection(enr, req, "trigger_reconcile_failed", appliedOperations)
			return
		}
		if !acknowledgeReconcileDevice(w, r.Context(), req, pairedDevice.DeviceID, config.AcknowledgeDevice) {
			enrichReconcileRejection(enr, req, "acknowledge_device_failed", appliedOperations)
			return
		}
		changes, lastID, ok := listReconcileChanges(w, r.Context(), req.LastChangelogID, config.ListChangesAfterID)
		if !ok {
			enrichReconcileRejection(enr, req, "list_changes_failed", appliedOperations)
			return
		}
		writeJSON(w, http.StatusAccepted, ReconcileResponse{Status: "accepted", LastChangelogID: lastID, AppliedOperations: appliedOperations, BridgeChanges: changes, Conflicts: []any{}})
		enr.SetOutcome("accepted").SetPayload(requestcapture.ReconcilePayload(req)).SetOperationRefs(operationRefsFromAppliedOperations(appliedOperations)).AddChangelogIDs(changelogIDsFromChanges(changes)...)
	})
}

// enrichReconcileRejection records a rejected reconcile outcome with its
// error code, sanitized payload, and applied-operation correlations -- the
// shape shared by the four post-decode rejection exits.
func enrichReconcileRejection(enr *requestcapture.CaptureEnrichment, req ReconcileRequest, errorCode string, appliedOperations []contracts.AppliedOperation) {
	enr.SetOutcome("rejected").SetErrorCode(errorCode).SetPayload(requestcapture.ReconcilePayload(req)).SetOperationRefs(operationRefsFromAppliedOperations(appliedOperations))
}

// authenticateSyncRequest authenticates a sync request and returns its device ID.
func authenticateSyncRequest(w http.ResponseWriter, r *http.Request, authenticate AuthenticateFunc) (device.PairedDevice, bool) {
	if authenticate == nil {
		return device.PairedDevice{}, true
	}
	return authenticate(w, r)
}

// decodeReconcileRequest decodes a reconcile request body and reports malformed input.
func decodeReconcileRequest(w http.ResponseWriter, r *http.Request) (ReconcileRequest, bool) {
	var req ReconcileRequest
	if r.Body == nil {
		return req, true
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err.Error() != "EOF" {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return ReconcileRequest{}, false
	}
	return req, true
}

// applyReconcileOperations applies pending operations and writes mapped failures.
func applyReconcileOperations(w http.ResponseWriter, ctx context.Context, operations []contracts.PendingOperation, apply PatchAnimeFunc) ([]contracts.AppliedOperation, bool) {
	results, err := applyPendingOperations(ctx, operations, apply)
	if err == nil {
		return results, true
	}
	status, message := pendingOperationErrorResponse(err)
	writeJSONError(w, status, message)
	return results, false
}

// pendingOperationErrorResponse maps a pending-operation error to HTTP details.
func pendingOperationErrorResponse(err error) (int, string) {
	if isInvalidPendingOperationError(err) {
		return http.StatusBadRequest, "invalid pending operation"
	}
	if isPendingPatchUnavailableError(err) {
		return http.StatusServiceUnavailable, "anime write unavailable"
	}
	return http.StatusInternalServerError, "apply pending operation failed"
}

// triggerReconcile invokes the reconciliation trigger when one is configured.
func triggerReconcile(w http.ResponseWriter, ctx context.Context, trigger TriggerReconcileFunc) bool {
	if trigger == nil {
		return true
	}
	if err := trigger(ctx); err == nil {
		return true
	}
	writeJSONError(w, http.StatusInternalServerError, "trigger reconcile failed")
	return false
}

// acknowledgeReconcileDevice records the client's changelog position when possible.
func acknowledgeReconcileDevice(w http.ResponseWriter, ctx context.Context, req ReconcileRequest, pairedID string, acknowledge AcknowledgeDeviceFunc) bool {
	deviceID := pairedID
	if deviceID == "" || acknowledge == nil {
		return true
	}
	if err := acknowledge(ctx, deviceID, req.LastChangelogID); err == nil {
		return true
	}
	writeJSONError(w, http.StatusInternalServerError, "acknowledge device failed")
	return false
}

// listReconcileChanges loads bridge changes after the client's last identifier.
func listReconcileChanges(w http.ResponseWriter, ctx context.Context, afterID int64, list ListChangesAfterIDFunc) ([]AnimeChange, int64, bool) {
	if list == nil {
		return nil, 0, true
	}
	changes, lastID, err := list(ctx, afterID)
	if err == nil {
		return changes, lastID, true
	}
	writeJSONError(w, http.StatusInternalServerError, "list bridge changes failed")
	return nil, 0, false
}

// applyPendingOperations applies supported pending anime operations in order.
// A conflict is a per-operation outcome, not a batch abort: once an anime id
// has conflicted within this batch, a later base-less operation for that same
// id is blocked without reaching the writer, so it cannot silently overwrite
// the value the conflict just protected (see design's "a base-less operation
// after a conflict on the same anime is not applied").
func applyPendingOperations(ctx context.Context, operations []contracts.PendingOperation, applyPendingPatch PatchAnimeFunc) ([]contracts.AppliedOperation, error) {
	results := make([]contracts.AppliedOperation, 0, len(operations))
	conflicted := map[string]int64{}
	for _, operation := range operations {
		if !isPendingPatchOperation(operation.Operation) {
			results = append(results, contracts.AppliedOperation{AnimeID: operation.AnimeID, Operation: operation.Operation, Applied: false, Reason: contracts.AppliedOperationReasonUnsupportedOperation})
			continue
		}
		patch, err := decodePendingOperationPatch(operation)
		if err != nil {
			return nil, invalidPendingOperationError{err: err}
		}
		if applyPendingPatch == nil {
			return nil, pendingPatchUnavailableError{}
		}
		if token, wasConflicted := conflicted[operation.AnimeID]; wasConflicted && patch.Base == nil {
			results = append(results, contracts.AppliedOperation{AnimeID: operation.AnimeID, Operation: operation.Operation, Applied: false, ModifiedAt: &token, Reason: contracts.AppliedOperationReasonConflict})
			continue
		}
		result, err := applyPendingPatch(ctx, operation.AnimeID, patch)
		switch {
		case err == nil:
			results = append(results, contracts.AppliedOperation{AnimeID: operation.AnimeID, Operation: operation.Operation, Applied: true, ModifiedAt: &result.ModifiedAt})
		case errors.Is(err, ErrAnimePatchConflict):
			conflicted[operation.AnimeID] = result.ModifiedAt
			results = append(results, contracts.AppliedOperation{AnimeID: operation.AnimeID, Operation: operation.Operation, Applied: false, ModifiedAt: &result.ModifiedAt, Reason: contracts.AppliedOperationReasonConflict})
		default:
			return results, err
		}
	}
	return results, nil
}

// operationRefsFromAppliedOperations converts applied operations into correlation refs.
func operationRefsFromAppliedOperations(applied []contracts.AppliedOperation) []requestcapture.OperationRef {
	refs := make([]requestcapture.OperationRef, 0, len(applied))
	for _, operation := range applied {
		outcome := "skipped"
		switch {
		case operation.Applied:
			outcome = "applied"
		case operation.Reason == contracts.AppliedOperationReasonConflict:
			outcome = "conflict"
		}
		refs = append(refs, requestcapture.OperationRef{AnimeID: operation.AnimeID, Operation: operation.Operation, Outcome: outcome})
	}
	return refs
}

// changelogIDsFromChanges extracts positive changelog IDs from bridge changes.
func changelogIDsFromChanges(changes []AnimeChange) []int64 {
	ids := make([]int64, 0, len(changes))
	for _, change := range changes {
		if change.ID > 0 {
			ids = append(ids, change.ID)
		}
	}
	return ids
}

type invalidPendingOperationError struct{ err error }

func (e invalidPendingOperationError) Error() string { return e.err.Error() }
func (e invalidPendingOperationError) Unwrap() error { return e.err }

type pendingPatchUnavailableError struct{}

func (pendingPatchUnavailableError) Error() string { return "pending patch unavailable" }

// isInvalidPendingOperationError reports whether an error represents bad input.
func isInvalidPendingOperationError(err error) bool {
	_, ok := err.(invalidPendingOperationError)
	return ok
}

// isPendingPatchUnavailableError reports whether anime patching is unavailable.
func isPendingPatchUnavailableError(err error) bool {
	_, ok := err.(pendingPatchUnavailableError)
	return ok
}

// decodePendingOperationPatch converts a pending operation payload into an anime patch.
func decodePendingOperationPatch(operation contracts.PendingOperation) (AnimePatch, error) {
	if strings.TrimSpace(operation.AnimeID) == "" {
		return AnimePatch{}, fmt.Errorf("pending operation missing anime id")
	}

	payload, err := json.Marshal(operation.Payload)
	if err != nil {
		return AnimePatch{}, fmt.Errorf("marshal pending operation payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPatch, "/api/animes/"+operation.AnimeID, bytes.NewReader(payload))
	if err != nil {
		return AnimePatch{}, fmt.Errorf("build pending operation request: %w", err)
	}

	patch, err := decodeAnimePatch(req)
	if err != nil {
		return AnimePatch{}, err
	}

	return patch, nil
}

// isPendingPatchOperation reports whether an operation requests an anime patch.
func isPendingPatchOperation(operation string) bool {
	switch strings.ToLower(strings.TrimSpace(operation)) {
	case "update", "patch":
		return true
	default:
		return false
	}
}
