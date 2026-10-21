package handlers

import (
	"encoding/json"
	"net/http"
)

// SeasonRatingConfig wires the season-rating ingestion handler. RecordRating is
// the transport-neutral seam into the season service (nil → 503).
type SeasonRatingConfig struct {
	Authenticate AuthenticateFunc
	RecordRating RecordSeasonRatingFunc
}

type seasonRatingRequest struct {
	AnimeID string `json:"anime_id"`
	Grade   int    `json:"grade"`
	RatedAt int64  `json:"rated_at"`
	// SeasonID is the season the grade was given in (MobileAnime.season.seasonId). Optional: when
	// it names a season other than the open one, the grade is not a candidate's (404).
	SeasonID string `json:"season_id,omitempty"`
}

// NewSeasonRatingHandler serves POST /api/seasons/active/ratings (SDD-44): a
// mobile-sourced first-episode grade for an anime in the active season. Outcomes:
// 204 recorded · 404 no season / not a candidate · 409 newer grade kept ·
// 422 invalid grade or malformed body · 503 ingestion unavailable.
func NewSeasonRatingHandler(config SeasonRatingConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if config.Authenticate != nil {
			if _, ok := config.Authenticate(w, r); !ok {
				return
			}
		}
		if config.RecordRating == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "season rating unavailable")
			return
		}

		var req seasonRatingRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			writeJSONError(w, http.StatusUnprocessableEntity, "invalid request body")
			return
		}

		result, err := config.RecordRating(r.Context(), req.AnimeID, req.Grade, req.RatedAt, req.SeasonID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "record rating failed")
			return
		}

		switch result.Outcome {
		case SeasonRatingRecorded:
			w.WriteHeader(http.StatusNoContent)
		case SeasonRatingInvalidGrade:
			writeJSONError(w, http.StatusUnprocessableEntity, "invalid grade")
		case SeasonRatingNotCandidate:
			writeJSONError(w, http.StatusNotFound, "not a season candidate")
		case SeasonRatingNewerGradeKept:
			writeJSON(w, http.StatusConflict, map[string]any{"grade": result.ExistingGrade, "source": result.ExistingSource})
		default:
			writeJSONError(w, http.StatusInternalServerError, "unknown rating outcome")
		}
	})
}
