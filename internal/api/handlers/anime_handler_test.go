package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/device"
)

func TestPatchAnimeHandlerReturnsUnauthorizedWithoutBearer(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(false),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"nrocapvisto":1}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.Code)
	}

	if stubs.queryCalls != 0 {
		t.Fatalf("expected query service not to be called, got %d calls", stubs.queryCalls)
	}

	if stubs.patchCalls != 0 {
		t.Fatalf("expected write service not to be called, got %d calls", stubs.patchCalls)
	}
}

func TestPatchAnimeHandlerRejectsInvalidPayloads(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{name: "estado above range", body: `{"estado":5}`, wantErr: "invalid estado"},
		{name: "estado negative", body: `{"estado":-1}`, wantErr: "invalid estado"},
		{name: "negative nrocapvisto", body: `{"nrocapvisto":-0.5}`, wantErr: "invalid nrocapvisto"},
		{name: "malformed json", body: `{`, wantErr: "invalid request body"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stubs := newAnimeHandlerStubs()
			handler := NewPatchAnimeHandler(PatchAnimeConfig{
				Authenticate: stubs.authenticate(true),
				QueryAnime:   stubs.queryAnime,
				PatchAnime:   stubs.patchAnime,
				IsNotFound:   func(error) bool { return false },
			})

			req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(tt.body))
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, req)

			if res.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
			}

			if !strings.Contains(res.Body.String(), tt.wantErr) {
				t.Fatalf("expected response body %q to contain %q", res.Body.String(), tt.wantErr)
			}

			if stubs.patchCalls != 0 {
				t.Fatalf("expected write service not to be called, got %d calls", stubs.patchCalls)
			}
		})
	}
}

func TestPatchAnimeHandlerReturnsNotFoundForZombieAnime(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.queryErr = errAnimeNotFound
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(err error) bool { return errors.Is(err, errAnimeNotFound) },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/zombie-1", strings.NewReader(`{"nrocapvisto":1}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.Code)
	}

	if stubs.patchCalls != 0 {
		t.Fatalf("expected write service not to be called, got %d calls", stubs.patchCalls)
	}
}

func TestPatchAnimeHandlerReturnsOKForValidPatch(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"estado":2,"nrocapvisto":10.5}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	if stubs.patchCalls != 1 {
		t.Fatalf("expected write service to be called once, got %d calls", stubs.patchCalls)
	}

	if stubs.patchedID != "anime-1" {
		t.Fatalf("expected patched anime id %q, got %q", "anime-1", stubs.patchedID)
	}

	if stubs.patchedPatch.Estado == nil || *stubs.patchedPatch.Estado != 2 {
		t.Fatalf("expected estado 2, got %#v", stubs.patchedPatch.Estado)
	}

	if stubs.patchedPatch.NroCapVisto == nil || *stubs.patchedPatch.NroCapVisto != 10.5 {
		t.Fatalf("expected nrocapvisto 10.5, got %#v", stubs.patchedPatch.NroCapVisto)
	}
}

func TestPatchAnimeHandlerForcesEstadoWhenProgressReachesTotalCap(t *testing.T) {
	t.Parallel()

	totalCap := 12.0
	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1", TotalCap: &totalCap}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"nrocapvisto":12}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	if stubs.patchedPatch.Estado == nil || *stubs.patchedPatch.Estado != 1 {
		t.Fatalf("expected forced estado 1, got %#v", stubs.patchedPatch.Estado)
	}
}

func TestPatchAnimeHandlerAllowsInactiveAnime(t *testing.T) {
	t.Parallel()

	activo := false
	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1", Activo: &activo}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"estado":3}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	if stubs.patchCalls != 1 {
		t.Fatalf("expected write service to be called once, got %d calls", stubs.patchCalls)
	}
}

func TestPatchAnimeHandlerSilentlyDiscardsClientTimestamp(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"nrocapvisto":1,"fechaUltCapVisto":{"$$date":1893456000000}}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	if stubs.patchCalls != 1 {
		t.Fatalf("expected write service to be called once, got %d calls", stubs.patchCalls)
	}

	if stubs.patchedPatch.NroCapVisto == nil || *stubs.patchedPatch.NroCapVisto != 1 {
		t.Fatalf("expected nrocapvisto 1, got %#v", stubs.patchedPatch.NroCapVisto)
	}

	if stubs.patchedPatch.Estado != nil {
		t.Fatalf("expected estado to remain unset, got %#v", stubs.patchedPatch.Estado)
	}
}

var errAnimeNotFound = errors.New("anime not found")

type animeHandlerStubs struct {
	effectiveAnime *EffectiveAnime
	queryErr       error
	patchErr       error
	patchedID      string
	patchedPatch   AnimePatch
	queryCalls     int
	patchCalls     int
}

func newAnimeHandlerStubs() *animeHandlerStubs {
	return &animeHandlerStubs{}
}

func (s *animeHandlerStubs) authenticate(authorized bool) AuthenticateFunc {
	return func(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool) {
		if !authorized {
			writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
			return device.PairedDevice{}, false
		}

		return device.PairedDevice{DeviceID: "device-1"}, true
	}
}

func (s *animeHandlerStubs) queryAnime(context.Context, string) (*EffectiveAnime, error) {
	s.queryCalls++
	if s.queryErr != nil {
		return nil, s.queryErr
	}
	return s.effectiveAnime, nil
}

func (s *animeHandlerStubs) patchAnime(_ context.Context, id string, patch AnimePatch) error {
	s.patchCalls++
	s.patchedID = id
	s.patchedPatch = patch
	return s.patchErr
}
