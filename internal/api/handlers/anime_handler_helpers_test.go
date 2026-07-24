package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/observability/mobilecapture"
)

func TestPatchAcceptedCapture(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		Capture:      stubs.capture,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"status":2,"episodesWatched":10.5}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}
	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	assertPatchCapture(t, stubs.captures[0], "accepted", http.StatusOK, "anime-1")
	if _, ok := stubs.captures[0].Payload["episodesWatched"]; !ok {
		t.Fatalf("expected sanitized episodesWatched payload, got %#v", stubs.captures[0].Payload)
	}
}

func TestPatchRejectedCapture(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.queryErr = errAnimeNotFound
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		Capture:      stubs.capture,
		IsNotFound:   func(err error) bool { return errors.Is(err, errAnimeNotFound) },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-404", strings.NewReader(`{"status":2}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.Code)
	}
	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	assertPatchCapture(t, stubs.captures[0], "rejected", http.StatusNotFound, "anime-404")
}

func TestPatchConflictCapturePreservesAuthoritativeID(t *testing.T) {
	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	stubs.patchResult = contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeConflict, ConflictID: "conflict-7"}
	stubs.patchErr = ErrAnimePatchConflict
	handler := NewPatchAnimeHandler(PatchAnimeConfig{Authenticate: stubs.authenticate(true), QueryAnime: stubs.queryAnime, PatchAnime: stubs.patchAnime, Capture: stubs.capture})
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"status":2}`)))
	if ids := stubs.captures[0].Correlations.ConflictIDs; len(ids) != 1 || ids[0] != "conflict-7" {
		t.Fatalf("expected authoritative conflict id, got %#v", ids)
	}
}

func TestPatchMalformedCapture(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		Capture:      stubs.capture,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
	}
	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	assertPatchCapture(t, stubs.captures[0], "malformed", http.StatusBadRequest, "anime-1")
}

func TestPatchCapturesDurationAndErrorBody(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.queryErr = errAnimeNotFound
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		Capture:      stubs.capture,
		IsNotFound:   func(err error) bool { return errors.Is(err, errAnimeNotFound) },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-404", strings.NewReader(`{"status":2}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	record := stubs.captures[0]
	if record.DurationMS == nil {
		t.Fatal("expected duration_ms to be captured")
	}
	if record.ResponseBody == nil {
		t.Fatal("expected response body to be captured for a rejected request")
	}
	if !strings.Contains(*record.ResponseBody, "anime not found") {
		t.Fatalf("expected sanitized error message, got %s", *record.ResponseBody)
	}
}

func TestPatchAcceptedOmitsResponseBody(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		Capture:      stubs.capture,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"status":2}`))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if len(stubs.captures) != 1 {
		t.Fatalf("expected one capture, got %#v", stubs.captures)
	}
	record := stubs.captures[0]
	if record.DurationMS == nil {
		t.Fatal("expected duration_ms to be captured even on success")
	}
	if record.ResponseBody != nil {
		t.Fatalf("expected accepted response to omit response body, got %#v", *record.ResponseBody)
	}
}

// errAnimeNotFound is the stub error used by patch anime tests.
var errAnimeNotFound = errors.New("anime not found")

// animeHandlerStubs provides test dependencies for the anime handler.
type animeHandlerStubs struct {
	effectiveAnime *EffectiveAnime
	queryErr       error
	patchErr       error
	patchResult    contracts.AnimePatchResult
	patchedID      string
	patchedPatch   AnimePatch
	queryCalls     int
	patchCalls     int
	captures       []mobilecapture.CaptureRecord
}

// newAnimeHandlerStubs creates the anime handler test dependencies.
func newAnimeHandlerStubs() *animeHandlerStubs {
	return &animeHandlerStubs{}
}

// authenticate returns a test authentication function with the requested result.
func (s *animeHandlerStubs) authenticate(authorized bool) AuthenticateFunc {
	return func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
		if !authorized {
			writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
			return device.PairedDevice{}, false
		}

		return device.PairedDevice{DeviceID: "device-1"}, true
	}
}

// queryAnime returns the configured anime and records the query call.
func (s *animeHandlerStubs) queryAnime(context.Context, string) (*EffectiveAnime, error) {
	s.queryCalls++
	if s.queryErr != nil {
		return nil, s.queryErr
	}
	return s.effectiveAnime, nil
}

// patchAnime records a patch request and returns its configured error.
func (s *animeHandlerStubs) patchAnime(_ context.Context, id string, patch AnimePatch) (contracts.AnimePatchResult, error) {
	s.patchCalls++
	s.patchedID = id
	s.patchedPatch = patch
	result := s.patchResult
	if result == (contracts.AnimePatchResult{}) {
		result = contracts.AnimePatchResult{AnimeID: id, Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}
	}
	return result, s.patchErr
}

// capture records the capture record for later assertions.
func (s *animeHandlerStubs) capture(record mobilecapture.CaptureRecord) bool {
	s.captures = append(s.captures, record)
	return true
}

// assertPatchCapture verifies a captured PATCH record matches expectations.
func assertPatchCapture(t *testing.T, record mobilecapture.CaptureRecord, wantOutcome string, wantStatus int, wantAnimeID string) {
	t.Helper()
	if record.Outcome != wantOutcome {
		t.Fatalf("expected outcome %q, got %#v", wantOutcome, record)
	}
	if record.HTTPStatus == nil || *record.HTTPStatus != wantStatus {
		t.Fatalf("expected http status %d, got %#v", wantStatus, record.HTTPStatus)
	}
	if record.AnimeID == nil || *record.AnimeID != wantAnimeID {
		t.Fatalf("expected anime id %q, got %#v", wantAnimeID, record.AnimeID)
	}
	if record.Device.DeviceID != "device-1" {
		t.Fatalf("expected trusted device id, got %#v", record.Device)
	}
}
