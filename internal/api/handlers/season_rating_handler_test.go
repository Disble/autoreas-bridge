package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/device"
)

type seasonRatingStubs struct {
	authOK      bool
	result      SeasonRatingResult
	recordErr   error
	recordCalls int
	gotAnimeID  string
	gotGrade    int
	gotRatedAt  int64
}

// authenticate returns the configured season-rating authentication result.
func (s *seasonRatingStubs) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	if !s.authOK {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}
	return device.PairedDevice{DeviceID: "dev-1"}, true
}

// record captures a season rating request and returns its configured result.
func (s *seasonRatingStubs) record(_ context.Context, animeID string, grade int, ratedAtMs int64) (SeasonRatingResult, error) {
	s.recordCalls++
	s.gotAnimeID, s.gotGrade, s.gotRatedAt = animeID, grade, ratedAtMs
	return s.result, s.recordErr
}

// newRatingHandler creates a season-rating handler backed by the test stubs.
func newRatingHandler(s *seasonRatingStubs) http.Handler {
	return NewSeasonRatingHandler(SeasonRatingConfig{
		Authenticate: s.authenticate,
		RecordRating: s.record,
	})
}

// postRating sends a season-rating request to a test handler.
func postRating(t *testing.T, h http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/seasons/active/ratings", strings.NewReader(body))
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	return res
}

func TestSeasonRatingUnauthorized(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: false}
	res := postRating(t, newRatingHandler(stubs), `{"anime_id":"a","grade":4,"rated_at":1}`)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.Code)
	}
	if stubs.recordCalls != 0 {
		t.Fatalf("record must not be called on auth failure")
	}
}

func TestSeasonRatingMethodNotAllowed(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true}
	req := httptest.NewRequest(http.MethodGet, "/api/seasons/active/ratings", nil)
	res := httptest.NewRecorder()
	newRatingHandler(stubs).ServeHTTP(res, req)
	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", res.Code)
	}
}

func TestSeasonRatingRecorded(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true, result: SeasonRatingResult{Outcome: SeasonRatingRecorded}}
	res := postRating(t, newRatingHandler(stubs), `{"anime_id":"anime-a","grade":4,"rated_at":1751500000000}`)
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.Code)
	}
	if stubs.gotAnimeID != "anime-a" || stubs.gotGrade != 4 || stubs.gotRatedAt != 1751500000000 {
		t.Fatalf("payload not forwarded: id=%q grade=%d ratedAt=%d", stubs.gotAnimeID, stubs.gotGrade, stubs.gotRatedAt)
	}
}

func TestSeasonRatingInvalidGradeOutcome(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true, result: SeasonRatingResult{Outcome: SeasonRatingInvalidGrade}}
	res := postRating(t, newRatingHandler(stubs), `{"anime_id":"anime-a","grade":9,"rated_at":1}`)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", res.Code)
	}
}

func TestSeasonRatingMalformedBodyIs422(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true}
	res := postRating(t, newRatingHandler(stubs), `{`)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", res.Code)
	}
	if stubs.recordCalls != 0 {
		t.Fatalf("record must not be called on a malformed body")
	}
}

func TestSeasonRatingNotCandidateIs404(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true, result: SeasonRatingResult{Outcome: SeasonRatingNotCandidate}}
	res := postRating(t, newRatingHandler(stubs), `{"anime_id":"ghost","grade":4,"rated_at":1}`)
	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.Code)
	}
}

func TestSeasonRatingManualConflictIs409WithGrade(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true, result: SeasonRatingResult{Outcome: SeasonRatingManualConflict, ExistingGrade: 5}}
	res := postRating(t, newRatingHandler(stubs), `{"anime_id":"anime-a","grade":2,"rated_at":1}`)
	if res.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", res.Code)
	}
	var body struct {
		Grade  int    `json:"grade"`
		Source string `json:"source"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode 409 body: %v", err)
	}
	if body.Grade != 5 || body.Source != "manual" {
		t.Fatalf("409 body = %+v, want {5 manual}", body)
	}
}

func TestSeasonRatingInfraErrorIs500(t *testing.T) {
	stubs := &seasonRatingStubs{authOK: true, recordErr: context.DeadlineExceeded}
	res := postRating(t, newRatingHandler(stubs), `{"anime_id":"anime-a","grade":4,"rated_at":1}`)
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", res.Code)
	}
}

func TestSeasonRatingUnavailableWithoutRecorder(t *testing.T) {
	h := NewSeasonRatingHandler(SeasonRatingConfig{Authenticate: (&seasonRatingStubs{authOK: true}).authenticate})
	res := postRating(t, h, `{"anime_id":"anime-a","grade":4,"rated_at":1}`)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.Code)
	}
}
