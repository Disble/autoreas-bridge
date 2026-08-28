package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"episodesWatched":1}`))
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
		{name: "estado above range", body: `{"status":5}`, wantErr: "invalid estado"},
		{name: "estado negative", body: `{"status":-1}`, wantErr: "invalid estado"},
		{name: "negative nrocapvisto", body: `{"episodesWatched":-0.5}`, wantErr: "invalid nrocapvisto"},
		{name: "malformed json", body: `{`, wantErr: "invalid request body"},
	}

	for _, tt := range tests {
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

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/zombie-1", strings.NewReader(`{"episodesWatched":1}`))
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

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"status":2,"episodesWatched":10.5}`))
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

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"episodesWatched":12}`))
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

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"status":3}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.Code)
	}

	if stubs.patchCalls != 1 {
		t.Fatalf("expected write service to be called once, got %d calls", stubs.patchCalls)
	}
}

func TestPatchAnimeHandlerAcceptsClientTimestampMillis(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"episodesWatched":1,"lastWatchedAt":1893456000000}`))
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

	if stubs.patchedPatch.FechaUltCapVisto == nil || *stubs.patchedPatch.FechaUltCapVisto != 1893456000000 {
		t.Fatalf("expected fechaUltCapVisto 1893456000000, got %#v", stubs.patchedPatch.FechaUltCapVisto)
	}

	if stubs.patchedPatch.Estado != nil {
		t.Fatalf("expected estado to remain unset, got %#v", stubs.patchedPatch.Estado)
	}
}

func TestPatchAnimeHandlerRejectsExtendedJsonTimestampObject(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"episodesWatched":1,"lastWatchedAt":{"$$date":1893456000000}}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusBadRequest, res.Code, res.Body.String())
	}
	if stubs.patchCalls != 0 {
		t.Fatalf("expected write service not to be called, got %d calls", stubs.patchCalls)
	}
}

// TestPatchAnimeHandlerDecodesBaseToken covers SDD-30 ADR-30-2/30-5: a patch
// payload carrying an explicit "base" OCC token decodes into AnimePatch.Base
// (including the legitimate zero value), and a payload omitting "base"
// entirely decodes to a nil Base -- the wire-level distinction the
// WriteService gate depends on to tell "old client" apart from "explicit
// base 0".
func TestPatchAnimeHandlerDecodesBaseToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		body     string
		wantBase *int64
	}{
		{name: "explicit positive base", body: `{"episodesWatched":1,"base":1710000000123}`, wantBase: new(int64(1710000000123))},
		{name: "explicit zero base", body: `{"episodesWatched":1,"base":0}`, wantBase: new(int64(0))},
		{name: "base omitted entirely", body: `{"episodesWatched":1}`, wantBase: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stubs := newAnimeHandlerStubs()
			stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
			handler := NewPatchAnimeHandler(PatchAnimeConfig{
				Authenticate: stubs.authenticate(true),
				QueryAnime:   stubs.queryAnime,
				PatchAnime:   stubs.patchAnime,
				IsNotFound:   func(error) bool { return false },
			})

			req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(tt.body))
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, req)

			if res.Code != http.StatusOK {
				t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, res.Code, res.Body.String())
			}

			gotBase := stubs.patchedPatch.Base
			switch {
			case tt.wantBase == nil:
				if gotBase != nil {
					t.Fatalf("expected nil base, got %d", *gotBase)
				}
			case gotBase == nil:
				t.Fatalf("expected base %d, got nil", *tt.wantBase)
			case *gotBase != *tt.wantBase:
				t.Fatalf("expected base %d, got %d", *tt.wantBase, *gotBase)
			}
		})
	}
}
