package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"autoreas-bridge/internal/device"
)

type activeSeasonStubs struct {
	authOK       bool
	snapshot     *ActiveSeasonSnapshot
	snapshotErr  error
	snapshotCall int
}

// authenticate returns the configured active-season authentication result.
func (s *activeSeasonStubs) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
	if !s.authOK {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
		return device.PairedDevice{}, false
	}
	return device.PairedDevice{DeviceID: "dev-1"}, true
}

// provide returns the configured active-season snapshot and records the call.
func (s *activeSeasonStubs) provide(_ context.Context) (*ActiveSeasonSnapshot, error) {
	s.snapshotCall++
	return s.snapshot, s.snapshotErr
}

// newActiveSeasonHandler creates an active-season handler backed by test stubs.
func newActiveSeasonHandler(s *activeSeasonStubs) http.Handler {
	return NewActiveSeasonHandler(ActiveSeasonConfig{
		Authenticate: s.authenticate,
		Snapshot:     s.provide,
	})
}

// getActiveSeason sends an active-season request to a test handler.
func getActiveSeason(t *testing.T, h http.Handler) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/seasons/active", nil)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	return res
}

func TestActiveSeasonUnauthorized(t *testing.T) {
	stubs := &activeSeasonStubs{authOK: false}
	res := getActiveSeason(t, newActiveSeasonHandler(stubs))
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.Code)
	}
	if stubs.snapshotCall != 0 {
		t.Fatalf("snapshot must not be read on auth failure")
	}
}

func TestActiveSeasonMethodNotAllowed(t *testing.T) {
	stubs := &activeSeasonStubs{authOK: true}
	req := httptest.NewRequest(http.MethodPost, "/api/seasons/active", nil)
	res := httptest.NewRecorder()
	newActiveSeasonHandler(stubs).ServeHTTP(res, req)
	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", res.Code)
	}
}

func TestActiveSeasonNoOpenSeasonIs404(t *testing.T) {
	stubs := &activeSeasonStubs{authOK: true, snapshot: nil}
	res := getActiveSeason(t, newActiveSeasonHandler(stubs))
	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.Code)
	}
}

func TestActiveSeasonInfraErrorIs500(t *testing.T) {
	stubs := &activeSeasonStubs{authOK: true, snapshotErr: context.DeadlineExceeded}
	res := getActiveSeason(t, newActiveSeasonHandler(stubs))
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", res.Code)
	}
}

func TestActiveSeasonUnavailableWithoutProvider(t *testing.T) {
	h := NewActiveSeasonHandler(ActiveSeasonConfig{Authenticate: (&activeSeasonStubs{authOK: true}).authenticate})
	res := getActiveSeason(t, h)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.Code)
	}
}

func TestActiveSeasonSerializesSnapshotWithEnglishWireKeys(t *testing.T) {
	graded := 5
	stubs := &activeSeasonStubs{
		authOK: true,
		snapshot: &ActiveSeasonSnapshot{
			SeasonID: "2026-q3",
			Candidates: []ActiveSeasonCandidate{
				{AnimeID: "a1", Grade: &graded, GradeSource: "bridge"},
				{AnimeID: "a2"},
			},
		},
	}
	res := getActiveSeason(t, newActiveSeasonHandler(stubs))
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.Code)
	}

	var body struct {
		SeasonID   string `json:"season_id"`
		Candidates []struct {
			AnimeID     string `json:"anime_id"`
			Grade       *int   `json:"grade"`
			GradeSource string `json:"grade_source"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode snapshot body: %v", err)
	}
	if body.SeasonID != "2026-q3" || len(body.Candidates) != 2 {
		t.Fatalf("unexpected snapshot: %+v", body)
	}
	graded1 := body.Candidates[0]
	if graded1.AnimeID != "a1" || graded1.Grade == nil || *graded1.Grade != 5 || graded1.GradeSource != "bridge" {
		t.Fatalf("graded candidate = %+v, want {a1 5 bridge}", graded1)
	}
	ungraded := body.Candidates[1]
	if ungraded.AnimeID != "a2" || ungraded.Grade != nil || ungraded.GradeSource != "" {
		t.Fatalf("ungraded candidate = %+v, want {a2 <nil> \"\"}", ungraded)
	}
}
