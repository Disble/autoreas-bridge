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
	"autoreas-bridge/internal/observability/requestcapture"
)

// Transport-level telemetry (duration_ms, response headers/body, http_status)
// now belongs entirely to internal/api's CaptureMiddleware -- see
// TestCaptureMiddlewareCapturesResponseBodyOnNon2xx and
// TestCaptureMiddlewareEnqueuesArrivalThenTerminalSharingOneRequestID in
// internal/api/capture_middleware_test.go. This file only asserts the
// semantic facts handlePatchAnime contributes via requestcapture.Enrich.

func TestPatchAcceptedCapture(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req, enr := enrichedPatchRequest(http.MethodPatch, "/api/animes/anime-1", `{"status":2,"episodesWatched":10.5}`)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}
	record := assertPatchCapture(t, enr, "accepted", "", "anime-1")
	if _, ok := record.Payload["episodesWatched"]; !ok {
		t.Fatalf("expected sanitized episodesWatched payload, got %#v", record.Payload)
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
		IsNotFound:   func(err error) bool { return errors.Is(err, errAnimeNotFound) },
	})

	req, enr := enrichedPatchRequest(http.MethodPatch, "/api/animes/anime-404", `{"status":2}`)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.Code)
	}
	assertPatchCapture(t, enr, "rejected", "anime_not_found", "anime-404")
}

func TestPatchConflictCapturePreservesAuthoritativeID(t *testing.T) {
	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	stubs.patchResult = contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeConflict, ConflictID: "conflict-7"}
	stubs.patchErr = ErrAnimePatchConflict
	handler := NewPatchAnimeHandler(PatchAnimeConfig{Authenticate: stubs.authenticate(true), QueryAnime: stubs.queryAnime, PatchAnime: stubs.patchAnime})
	req, enr := enrichedPatchRequest(http.MethodPatch, "/api/animes/anime-1", `{"status":2}`)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	record := requestcapture.MergeEnrichment(requestcapture.CaptureRecord{}, enr)
	if ids := record.Correlations.ConflictIDs; len(ids) != 1 || ids[0] != "conflict-7" {
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
		IsNotFound:   func(error) bool { return false },
	})

	req, enr := enrichedPatchRequest(http.MethodPatch, "/api/animes/anime-1", `{`)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
	}
	assertPatchCapture(t, enr, "malformed", "invalid_request_body", "anime-1")
}

// enrichedPatchRequest builds a PATCH request carrying its own enrichment
// context, mirroring how CaptureMiddleware installs one in production, and
// returns the holder handlePatchAnime will mutate so the test can inspect it
// after ServeHTTP returns.
func enrichedPatchRequest(method, path, body string) (*http.Request, *requestcapture.CaptureEnrichment) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	ctx, enr := requestcapture.NewEnrichmentContext(req.Context())
	return req.WithContext(ctx), enr
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

// assertPatchCapture merges the enrichment holder onto an empty transport
// record and verifies the semantic facts handlePatchAnime contributed match
// expectations, returning the merged record for further assertions (e.g.
// Payload). wantErrorCode "" asserts an empty error code.
func assertPatchCapture(t *testing.T, enr *requestcapture.CaptureEnrichment, wantOutcome, wantErrorCode, wantAnimeID string) requestcapture.CaptureRecord {
	t.Helper()
	record := requestcapture.MergeEnrichment(requestcapture.CaptureRecord{}, enr)
	if record.Outcome != wantOutcome {
		t.Fatalf("expected outcome %q, got %#v", wantOutcome, record)
	}
	if record.ErrorCode != wantErrorCode {
		t.Fatalf("expected error code %q, got %#v", wantErrorCode, record)
	}
	if record.AnimeID == nil || *record.AnimeID != wantAnimeID {
		t.Fatalf("expected anime id %q, got %#v", wantAnimeID, record.AnimeID)
	}
	if record.Device.DeviceID != "device-1" {
		t.Fatalf("expected trusted device id, got %#v", record.Device)
	}
	return record
}
