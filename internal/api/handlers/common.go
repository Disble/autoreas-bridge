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
type MobileAnime = contracts.MobileAnime
type AnimeChange = contracts.AnimeChange
type DeviceInfo = contracts.DeviceInfo
type ConflictInfo = contracts.ConflictInfo
type StatusInfo = contracts.StatusInfo
type ReconcileRequest = contracts.ReconcileRequest
type ReconcileResponse = contracts.ReconcileResponse

type AuthenticateFunc func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool)
type QueryAnimeFunc func(ctx context.Context, id string) (*EffectiveAnime, error)
type ListMobileAnimesFunc func(ctx context.Context) ([]MobileAnime, error)
type GetMobileAnimeFunc func(ctx context.Context, id string) (*MobileAnime, error)
type PatchAnimeFunc func(ctx context.Context, id string, patch AnimePatch) error
type TriggerReconcileFunc func(ctx context.Context) error
type ListChangesSinceFunc func(ctx context.Context, sinceMs int64) ([]AnimeChange, int64, error)
type ListChangesAfterIDFunc func(ctx context.Context, lastID int64) ([]AnimeChange, int64, error)
type GetStatusFunc func(ctx context.Context) (StatusInfo, error)
type ListDevicesFunc func(ctx context.Context) ([]DeviceInfo, error)
type RevokeDeviceFunc func(ctx context.Context, id string) error
type ListConflictsFunc func(ctx context.Context) ([]ConflictInfo, error)
type ResolveConflictFunc func(ctx context.Context, id string) error

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
