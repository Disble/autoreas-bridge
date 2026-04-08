package handlers

import "net/http"

type SyncHandlerConfig struct {
	Authenticate     AuthenticateFunc
	TriggerReconcile TriggerReconcileFunc
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

		writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
	})
}
