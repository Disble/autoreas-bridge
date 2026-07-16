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

type AnimePatch = contracts.AnimePatch
type EffectiveAnime = contracts.EffectiveAnime
type MobileAnime = contracts.MobileAnime
type AnimeChange = contracts.AnimeChange
type DeviceInfo = contracts.DeviceInfo
type ConflictInfo = contracts.ConflictInfo
type StatusInfo = contracts.StatusInfo
type ReconcileRequest = contracts.ReconcileRequest
type ReconcileResponse = contracts.ReconcileResponse
type ActiveSeasonSnapshot = contracts.ActiveSeasonSnapshot
type ActiveSeasonCandidate = contracts.ActiveSeasonCandidate

type AuthenticateFunc func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool)
type QueryAnimeFunc func(ctx context.Context, id string) (*EffectiveAnime, error)
type ListMobileAnimesFunc func(ctx context.Context) ([]MobileAnime, error)
type GetMobileAnimeFunc func(ctx context.Context, id string) (*MobileAnime, error)
type PatchAnimeFunc func(ctx context.Context, id string, patch AnimePatch) error
type TriggerReconcileFunc func(ctx context.Context) error
type ListChangesSinceFunc func(ctx context.Context, sinceMs int64) ([]AnimeChange, int64, error)
type ListChangesAfterIDFunc func(ctx context.Context, lastID int64) ([]AnimeChange, int64, error)
type AcknowledgeDeviceFunc func(ctx context.Context, deviceID string, lastChangelogID int64) error
type GetStatusFunc func(ctx context.Context) (StatusInfo, error)
type ListDevicesFunc func(ctx context.Context) ([]DeviceInfo, error)
type RevokeDeviceFunc func(ctx context.Context, id string) error
type ListConflictsFunc func(ctx context.Context) ([]ConflictInfo, error)
type ResolveConflictFunc func(ctx context.Context, id string) error

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

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
