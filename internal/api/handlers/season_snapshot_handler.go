package handlers

import (
	"net/http"
)

// ActiveSeasonConfig wires the active-season snapshot handler. Snapshot is the
// transport-neutral seam into the season service (nil → 503).
type ActiveSeasonConfig struct {
	Authenticate AuthenticateFunc
	Snapshot     ActiveSeasonSnapshotFunc
}

// NewActiveSeasonHandler serves GET /api/seasons/active (SDD-44 season sync): the
// bridge-declared candidate set and premiere grades mobile needs to hydrate its
// active-season state. Outcomes: 200 snapshot · 404 no open season · 500 read
// failure · 503 snapshot unavailable.
func NewActiveSeasonHandler(config ActiveSeasonConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if config.Authenticate != nil {
			if _, ok := config.Authenticate(w, r); !ok {
				return
			}
		}
		if config.Snapshot == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "active season unavailable")
			return
		}

		snapshot, err := config.Snapshot(r.Context())
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "read active season failed")
			return
		}
		if snapshot == nil {
			writeJSONError(w, http.StatusNotFound, "no active season")
			return
		}

		writeJSON(w, http.StatusOK, snapshot)
	})
}
