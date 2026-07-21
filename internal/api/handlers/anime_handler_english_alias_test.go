package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestPatchAnimeHandlerAcceptsEnglishWireAliases proves the SDD-55 Slice C additive English
// wire rename (openapi spec: "Static OpenAPI Document Uses English Wire Field Names",
// "Wire Rename Is Announced and Coordinated With Mobile"): the new English field names
// decode into the same patch fields as the Legacy-Spanish names they sit alongside.
func TestPatchAnimeHandlerAcceptsEnglishWireAliases(t *testing.T) {
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
		`{"status":2,"episodesWatched":10.5,"days":["Monday"]}`,
	))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, res.Code, res.Body.String())
	}
	if stubs.patchCalls != 1 {
		t.Fatalf("expected write service to be called once, got %d calls", stubs.patchCalls)
	}
	if stubs.patchedPatch.Estado == nil || *stubs.patchedPatch.Estado != 2 {
		t.Fatalf("expected status alias to decode into Estado 2, got %#v", stubs.patchedPatch.Estado)
	}
	if stubs.patchedPatch.NroCapVisto == nil || *stubs.patchedPatch.NroCapVisto != 10.5 {
		t.Fatalf("expected episodesWatched alias to decode into NroCapVisto 10.5, got %#v", stubs.patchedPatch.NroCapVisto)
	}
	if len(stubs.patchedPatch.Dias) != 1 || stubs.patchedPatch.Dias[0] != "Monday" {
		t.Fatalf("expected days alias to decode into Dias [Monday], got %#v", stubs.patchedPatch.Dias)
	}
}

// TestPatchAnimeHandlerRejectsInvalidEnglishStatusAlias proves the English alias applies the
// same validation range as the Legacy-Spanish "estado" field.
func TestPatchAnimeHandlerRejectsInvalidEnglishStatusAlias(t *testing.T) {
	t.Parallel()

	stubs := newAnimeHandlerStubs()
	handler := NewPatchAnimeHandler(PatchAnimeConfig{
		Authenticate: stubs.authenticate(true),
		QueryAnime:   stubs.queryAnime,
		PatchAnime:   stubs.patchAnime,
		IsNotFound:   func(error) bool { return false },
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"status":5}`))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.Code)
	}
	if stubs.patchCalls != 0 {
		t.Fatalf("expected write service not to be called, got %d calls", stubs.patchCalls)
	}
}
