package handlers

import (
	"encoding/json"
	"net/http"
)

type SyncHandlerConfig struct {
	Authenticate       AuthenticateFunc
	TriggerReconcile   TriggerReconcileFunc
	ListChangesAfterID ListChangesAfterIDFunc
}

func NewSyncHandler(config SyncHandlerConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.Authenticate != nil {
			if _, ok := config.Authenticate(w, r); !ok {
				return
			}
		}

		if err := config.TriggerReconcile(r.Context()); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "trigger reconcile failed")
			return
		}

		var req ReconcileRequest
		if r.Body != nil {
			decoder := json.NewDecoder(r.Body)
			if err := decoder.Decode(&req); err != nil && err.Error() != "EOF" {
				writeJSONError(w, http.StatusBadRequest, "invalid request body")
				return
			}
		}

		var bridgeChanges []AnimeChange
		if config.ListChangesAfterID != nil {
			changes, _, err := config.ListChangesAfterID(r.Context(), req.LastChangelogID)
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "list bridge changes failed")
				return
			}
			bridgeChanges = changes
		}

		writeJSON(w, http.StatusAccepted, ReconcileResponse{
			Status:        "accepted",
			BridgeChanges: bridgeChanges,
			Conflicts:     []any{},
		})
	})
}
