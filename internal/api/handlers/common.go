package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

// AnimePatch aliases the write contract consumed by handler adapters.
type AnimePatch = contracts.AnimePatch

// EffectiveAnime aliases the effective anime read model used by handlers.
type EffectiveAnime = contracts.EffectiveAnime

// MobileAnime aliases the mobile-facing anime payload used by handlers.
type MobileAnime = contracts.MobileAnime

// AnimeChange aliases the sync delta payload emitted by bridge services.
type AnimeChange = contracts.AnimeChange

// DeviceInfo aliases the paired-device read model exposed by admin handlers.
type DeviceInfo = contracts.DeviceInfo

// ConflictInfo aliases the sync-conflict read model exposed by admin handlers.
type ConflictInfo = contracts.ConflictInfo

// StatusInfo aliases the bridge status payload exposed by status handlers.
type StatusInfo = contracts.StatusInfo

// ReconcileRequest aliases the mobile reconcile request contract.
type ReconcileRequest = contracts.ReconcileRequest

// ReconcileResponse aliases the mobile reconcile response contract.
type ReconcileResponse = contracts.ReconcileResponse

// ActiveSeasonSnapshot aliases the active-season snapshot payload for mobile clients.
type ActiveSeasonSnapshot = contracts.ActiveSeasonSnapshot

// ActiveSeasonCandidate aliases one candidate entry inside an active-season snapshot.
type ActiveSeasonCandidate = contracts.ActiveSeasonCandidate

// AuthenticateFunc authenticates an inbound transport request.
type AuthenticateFunc func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool)

// QueryAnimeFunc loads one effective anime for request handling.
type QueryAnimeFunc func(ctx context.Context, id string) (*EffectiveAnime, error)

// ListMobileAnimesFunc lists mobile-facing anime payloads.
type ListMobileAnimesFunc func(ctx context.Context) ([]MobileAnime, error)

// GetMobileAnimeFunc loads one mobile-facing anime payload.
type GetMobileAnimeFunc func(ctx context.Context, id string) (*MobileAnime, error)

// PatchAnimeFunc applies one anime patch through the write seam.
type PatchAnimeFunc func(ctx context.Context, id string, patch AnimePatch) error

// TriggerReconcileFunc requests bridge-wide reconcile fan-out.
type TriggerReconcileFunc func(ctx context.Context) error

// ListChangesSinceFunc lists bridge changes after a timestamp checkpoint.
type ListChangesSinceFunc func(ctx context.Context, sinceMs int64) ([]AnimeChange, int64, error)

// ListChangesAfterIDFunc lists bridge changes after a changelog checkpoint.
type ListChangesAfterIDFunc func(ctx context.Context, lastID int64) ([]AnimeChange, int64, error)

// AcknowledgeDeviceFunc stores a device checkpoint after reconcile.
type AcknowledgeDeviceFunc func(ctx context.Context, deviceID string, lastChangelogID int64) error

// GetStatusFunc loads the bridge status payload.
type GetStatusFunc func(ctx context.Context) (StatusInfo, error)

// ListDevicesFunc loads paired-device read models.
type ListDevicesFunc func(ctx context.Context) ([]DeviceInfo, error)

// RevokeDeviceFunc revokes one paired device by ID.
type RevokeDeviceFunc func(ctx context.Context, id string) error

// ListConflictsFunc loads unresolved sync conflicts.
type ListConflictsFunc func(ctx context.Context) ([]ConflictInfo, error)

// ResolveConflictFunc resolves one sync conflict by ID.
type ResolveConflictFunc func(ctx context.Context, id string) error

// ErrAnimePatchConflict marks a semantic write conflict detected by the write service.
var ErrAnimePatchConflict = errors.New("anime patch conflict")

// AdaptAnimePatchWriter keeps the established HTTP/mobile error-only seam while
// refusing to downgrade a semantic conflict into transport success.
func AdaptAnimePatchWriter(writer contracts.AnimeWriteService) PatchAnimeFunc {
	return func(ctx context.Context, id string, patch AnimePatch) error {
		result, err := writer.PatchAnime(ctx, id, patch)
		if err != nil {
			return err
		}
		switch result.Outcome {
		case contracts.AnimePatchOutcomeApplied, contracts.AnimePatchOutcomeNoOp:
			return nil
		case contracts.AnimePatchOutcomeConflict:
			return fmt.Errorf("%w: anime=%s modifiedAt=%d conflictId=%s", ErrAnimePatchConflict, result.AnimeID, result.ModifiedAt, result.ConflictID)
		default:
			return fmt.Errorf("unexpected anime patch outcome %q", result.Outcome)
		}
	}
}

// SeasonRatingOutcome is the transport-neutral result of ingesting a season
// rating, mapped to an HTTP status by the handler. The composition root owns the
// season→outcome mapping so the handlers package stays decoupled from season.
type SeasonRatingOutcome int

const (
	// SeasonRatingRecorded — the grade was applied (HTTP 204).
	SeasonRatingRecorded SeasonRatingOutcome = iota
	// SeasonRatingInvalidGrade — the grade was outside 1–6 (HTTP 422).
	SeasonRatingInvalidGrade
	// SeasonRatingNotCandidate — no open season, or the anime is not a
	// candidate (HTTP 404, terminal — mobile must not retry).
	SeasonRatingNotCandidate
	// SeasonRatingManualConflict — a manual grade is present and kept; the
	// mobile write is rejected (HTTP 409, body carries the kept grade).
	SeasonRatingManualConflict
)

// SeasonRatingResult carries the ingestion outcome and, on a manual conflict, the
// kept grade for the 409 response body.
type SeasonRatingResult struct {
	Outcome       SeasonRatingOutcome
	ExistingGrade int
}

// RecordSeasonRatingFunc ingests one mobile-sourced grade for an anime in the
// active season. ratedAtMs is the epoch-ms watch/grade moment. A non-nil error is
// an infrastructure failure (HTTP 500); domain outcomes ride SeasonRatingResult.
type RecordSeasonRatingFunc func(ctx context.Context, animeID string, grade int, ratedAtMs int64) (SeasonRatingResult, error)

// ActiveSeasonSnapshotFunc returns the current active-season snapshot for mobile,
// or (nil, nil) when no season is open (the handler maps nil to HTTP 404). A non-nil
// error is an infrastructure failure (HTTP 500).
type ActiveSeasonSnapshotFunc func(ctx context.Context) (*ActiveSeasonSnapshot, error)

// writeJSONError writes an error message as a JSON response.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// writeJSON encodes a payload as a JSON HTTP response.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
