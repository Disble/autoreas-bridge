package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

type AnimePatch = contracts.AnimePatch
type EffectiveAnime = contracts.EffectiveAnime

type AuthenticateFunc func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool)
type QueryAnimeFunc func(ctx context.Context, id string) (*EffectiveAnime, error)
type PatchAnimeFunc func(ctx context.Context, id string, patch AnimePatch) error
type TriggerReconcileFunc func(ctx context.Context) error

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
