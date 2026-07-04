package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"autoreas-bridge/internal/api/contracts"
)

type SyncHandlerConfig struct {
	Authenticate       AuthenticateFunc
	ApplyPendingPatch  PatchAnimeFunc
	TriggerReconcile   TriggerReconcileFunc
	ListChangesAfterID ListChangesAfterIDFunc
	AcknowledgeDevice  AcknowledgeDeviceFunc
}

func NewSyncHandler(config SyncHandlerConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var pairedDeviceID string
		if config.Authenticate != nil {
			paired, ok := config.Authenticate(w, r)
			if !ok {
				return
			}
			pairedDeviceID = paired.DeviceID
		}

		var req ReconcileRequest
		if r.Body != nil {
			decoder := json.NewDecoder(r.Body)
			if err := decoder.Decode(&req); err != nil && err.Error() != "EOF" {
				writeJSONError(w, http.StatusBadRequest, "invalid request body")
				return
			}
		}

		appliedOperations, err := applyPendingOperations(r.Context(), req.PendingOperations, config.ApplyPendingPatch)
		if err != nil {
			status := http.StatusInternalServerError
			message := "apply pending operation failed"
			if isInvalidPendingOperationError(err) {
				status = http.StatusBadRequest
				message = "invalid pending operation"
			} else if isPendingPatchUnavailableError(err) {
				status = http.StatusServiceUnavailable
				message = "anime write unavailable"
			}
			writeJSONError(w, status, message)
			return
		}

		if config.TriggerReconcile != nil {
			if err := config.TriggerReconcile(r.Context()); err != nil {
				writeJSONError(w, http.StatusInternalServerError, "trigger reconcile failed")
				return
			}
		}

		ackDeviceID := pairedDeviceID
		if ackDeviceID == "" {
			ackDeviceID = strings.TrimSpace(req.DeviceID)
		}
		if ackDeviceID != "" && config.AcknowledgeDevice != nil {
			if err := config.AcknowledgeDevice(r.Context(), ackDeviceID, req.LastChangelogID); err != nil {
				writeJSONError(w, http.StatusInternalServerError, "acknowledge device failed")
				return
			}
		}

		var bridgeChanges []AnimeChange
		var lastChangelogID int64
		if config.ListChangesAfterID != nil {
			changes, newLastID, err := config.ListChangesAfterID(r.Context(), req.LastChangelogID)
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "list bridge changes failed")
				return
			}
			bridgeChanges = changes
			lastChangelogID = newLastID
		}

		writeJSON(w, http.StatusAccepted, ReconcileResponse{
			Status:            "accepted",
			LastChangelogID:   lastChangelogID,
			AppliedOperations: appliedOperations,
			BridgeChanges:     bridgeChanges,
			Conflicts:         []any{},
		})
	})
}

func applyPendingOperations(ctx context.Context, operations []contracts.PendingOperation, applyPendingPatch PatchAnimeFunc) ([]contracts.AppliedOperation, error) {
	results := make([]contracts.AppliedOperation, 0, len(operations))
	for _, operation := range operations {
		if !isPendingPatchOperation(operation.Operation) {
			results = append(results, contracts.AppliedOperation{AnimeID: operation.AnimeID, Operation: operation.Operation, Applied: false})
			continue
		}
		patch, err := decodePendingOperationPatch(operation)
		if err != nil {
			return nil, invalidPendingOperationError{err: err}
		}
		if applyPendingPatch == nil {
			return nil, pendingPatchUnavailableError{}
		}
		if err := applyPendingPatch(ctx, operation.AnimeID, patch); err != nil {
			return nil, err
		}
		results = append(results, contracts.AppliedOperation{AnimeID: operation.AnimeID, Operation: operation.Operation, Applied: true})
	}
	return results, nil
}

type invalidPendingOperationError struct{ err error }

func (e invalidPendingOperationError) Error() string { return e.err.Error() }
func (e invalidPendingOperationError) Unwrap() error { return e.err }

type pendingPatchUnavailableError struct{}

func (pendingPatchUnavailableError) Error() string { return "pending patch unavailable" }

func isInvalidPendingOperationError(err error) bool {
	_, ok := err.(invalidPendingOperationError)
	return ok
}

func isPendingPatchUnavailableError(err error) bool {
	_, ok := err.(pendingPatchUnavailableError)
	return ok
}

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

func isPendingPatchOperation(operation string) bool {
	switch strings.ToLower(strings.TrimSpace(operation)) {
	case "update", "patch":
		return true
	default:
		return false
	}
}
