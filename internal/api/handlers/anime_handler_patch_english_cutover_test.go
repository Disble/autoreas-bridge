package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestPatchAnimeHandlerRejectsStaleSpanishOnlyKeys proves the SDD-56 hard
// cutover (openspec: "Slice 3: PATCH Cutover + Docs"): once the deprecated
// Spanish patch key is present without its English replacement, the request
// fails loud with 400 instead of silently decoding the Legacy-Spanish alias
// (SDD-55's additive behavior, now removed).
func TestPatchAnimeHandlerRejectsStaleSpanishOnlyKeys(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
	}{
		{name: "estado only", body: `{"estado":1}`},
		{name: "nrocapvisto only", body: `{"nrocapvisto":5}`},
		{name: "dias only", body: `{"dias":["Lunes"]}`},
		{name: "fechaUltCapVisto only", body: `{"fechaUltCapVisto":1710000000123}`},
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

			if res.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d body=%s", http.StatusBadRequest, res.Code, res.Body.String())
			}
			if stubs.patchCalls != 0 {
				t.Fatalf("expected write service not to be called, got %d calls", stubs.patchCalls)
			}
		})
	}
}

// TestPatchAnimeHandlerEnglishKeyWinsOverStaleSpanish proves that when both the
// English key and its deprecated Spanish counterpart are present for the same
// concept, the request succeeds and the English value is applied; the stale
// Spanish value is ignored rather than rejected.
func TestPatchAnimeHandlerEnglishKeyWinsOverStaleSpanish(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(
		`{"status":1,"estado":2,"episodesWatched":10,"nrocapvisto":99,"days":["Monday"],"dias":["Lunes"],"lastWatchedAt":1893456000000,"fechaUltCapVisto":1}`,
	))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, res.Code, res.Body.String())
	}
	if stubs.patchedPatch.Estado == nil || *stubs.patchedPatch.Estado != 1 {
		t.Fatalf("expected English status to win with value 1, got %#v", stubs.patchedPatch.Estado)
	}
	if stubs.patchedPatch.NroCapVisto == nil || *stubs.patchedPatch.NroCapVisto != 10 {
		t.Fatalf("expected English episodesWatched to win with value 10, got %#v", stubs.patchedPatch.NroCapVisto)
	}
	if len(stubs.patchedPatch.Dias) != 1 || stubs.patchedPatch.Dias[0] != "Monday" {
		t.Fatalf("expected English days to win with value [Monday], got %#v", stubs.patchedPatch.Dias)
	}
	if stubs.patchedPatch.FechaUltCapVisto == nil || *stubs.patchedPatch.FechaUltCapVisto != 1893456000000 {
		t.Fatalf("expected English lastWatchedAt to win with value 1893456000000, got %#v", stubs.patchedPatch.FechaUltCapVisto)
	}
}

// TestPatchAnimeHandlerIgnoresTrulyUnknownKeys proves a key that is neither
// English nor a deprecated Spanish alias is silently ignored -- no 400.
func TestPatchAnimeHandlerIgnoresTrulyUnknownKeys(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	stubs.effectiveAnime = &EffectiveAnime{ID: "anime-1"}
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"foo":1}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, res.Code, res.Body.String())
	}
	if stubs.patchCalls != 1 {
		t.Fatalf("expected write service to be called once, got %d calls", stubs.patchCalls)
	}
}
