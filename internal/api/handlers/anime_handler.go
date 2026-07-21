package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// PatchAnimeConfig wires the dependencies required by the PATCH /api/animes handler.
type PatchAnimeConfig struct {
	Authenticate AuthenticateFunc
	QueryAnime   QueryAnimeFunc
	PatchAnime   PatchAnimeFunc
	IsNotFound   func(error) bool
}

// NewPatchAnimeHandler builds the PATCH /api/animes/:id transport adapter.
func NewPatchAnimeHandler(config PatchAnimeConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlePatchAnime(w, r, config)
	})
}

// handlePatchAnime coordinates authentication, decoding, and anime patching.
func handlePatchAnime(w http.ResponseWriter, r *http.Request, config PatchAnimeConfig) {
	if !authenticatePatchRequest(w, r, config.Authenticate) {
		return
	}
	animeID, ok := patchAnimeID(w, r)
	if !ok {
		return
	}
	patch, ok := requestAnimePatch(w, r)
	if !ok {
		return
	}
	effectiveAnime, ok := queryPatchAnime(w, r, animeID, config)
	if !ok {
		return
	}
	patch = domain.ApplyCompletionStateMachine(patch, effectiveAnime.TotalCap)
	if !applyAnimeRequestPatch(w, r, animeID, patch, config) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// authenticatePatchRequest authenticates a patch request when configured.
func authenticatePatchRequest(w http.ResponseWriter, r *http.Request, authenticate AuthenticateFunc) bool {
	if authenticate == nil {
		return true
	}
	_, ok := authenticate(w, r)
	return ok
}

// patchAnimeID extracts and validates the anime identifier from the request path.
func patchAnimeID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := strings.TrimPrefix(r.URL.Path, "/api/animes/")
	if id == "" || id == r.URL.Path {
		http.NotFound(w, r)
		return "", false
	}
	return id, true
}

// requestAnimePatch decodes the request body and writes malformed-body errors.
func requestAnimePatch(w http.ResponseWriter, r *http.Request) (AnimePatch, bool) {
	patch, err := decodeAnimePatch(r)
	if err == nil {
		return patch, true
	}
	writeJSONError(w, http.StatusBadRequest, err.Error())
	return AnimePatch{}, false
}

// queryPatchAnime loads the current anime needed for patch processing.
func queryPatchAnime(w http.ResponseWriter, r *http.Request, id string, config PatchAnimeConfig) (*EffectiveAnime, bool) {
	anime, err := config.QueryAnime(r.Context(), id)
	if err == nil {
		return anime, true
	}
	writePatchAnimeError(w, err, config.IsNotFound, "query anime failed")
	return nil, false
}

// applyAnimeRequestPatch applies the decoded patch and maps its errors to HTTP.
func applyAnimeRequestPatch(w http.ResponseWriter, r *http.Request, id string, patch AnimePatch, config PatchAnimeConfig) bool {
	err := config.PatchAnime(r.Context(), id, patch)
	if err == nil {
		return true
	}
	writePatchAnimeError(w, err, config.IsNotFound, "patch anime failed")
	return false
}

// writePatchAnimeError maps patch failures to their HTTP response.
func writePatchAnimeError(w http.ResponseWriter, err error, isNotFound func(error) bool, fallback string) {
	if isAnimeNotFound(err, isNotFound) {
		writeJSONError(w, http.StatusNotFound, "anime not found")
		return
	}
	writeJSONError(w, http.StatusInternalServerError, fallback)
}

// decodeAnimePatch parses the supported anime patch fields from a request.
func decodeAnimePatch(r *http.Request) (AnimePatch, error) {
	var payload map[string]json.RawMessage
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return AnimePatch{}, errors.New("invalid request body")
	}

	patch, err := decodeAnimePatchFields(payload)
	if err != nil {
		return AnimePatch{}, err
	}

	// SDD-30 ADR-30-2/30-5: base is the mobile client's last-known modified_at
	// OCC token. Absent from the wire entirely -> Base stays nil (old client,
	// safe-path semantics in WriteService.PatchAnime). Present -> decoded as-is,
	// including 0, which is a legitimate (pre-migration) token value.
	return decodeAnimePatchBase(payload, patch)
}

// decodeAnimePatchFields decodes each supported patch field from raw JSON.
func decodeAnimePatchFields(payload map[string]json.RawMessage) (AnimePatch, error) {
	var patch AnimePatch
	if err := decodePatchEstado(payload, &patch); err != nil {
		return AnimePatch{}, err
	}
	if err := decodePatchProgress(payload, &patch); err != nil {
		return AnimePatch{}, err
	}
	if err := decodePatchLastWatched(payload, &patch); err != nil {
		return AnimePatch{}, err
	}
	if err := decodePatchDays(payload, &patch); err != nil {
		return AnimePatch{}, err
	}
	return patch, nil
}

// decodePatchEstado decodes and validates the estado patch field, additively accepting the
// SDD-55 English wire alias "status" alongside the Legacy-Spanish "estado" (openapi spec:
// "Static OpenAPI Document Uses English Wire Field Names"; the rename is additive, so
// un-migrated mobile clients keep working un-renamed).
func decodePatchEstado(payload map[string]json.RawMessage, patch *AnimePatch) error {
	raw, ok := firstPresentField(payload, "status", "estado")
	if !ok {
		return nil
	}
	var value int
	if err := json.Unmarshal(raw, &value); err != nil || value < 0 || value > 3 {
		return errors.New("invalid estado")
	}
	patch.Estado = &value
	return nil
}

// decodePatchProgress decodes and validates the watched-episode patch field, additively
// accepting the SDD-55 English wire alias "episodesWatched" alongside "nrocapvisto".
func decodePatchProgress(payload map[string]json.RawMessage, patch *AnimePatch) error {
	raw, ok := firstPresentField(payload, "episodesWatched", "nrocapvisto")
	if !ok {
		return nil
	}
	var value float64
	if err := json.Unmarshal(raw, &value); err != nil || value < 0 {
		return errors.New("invalid nrocapvisto")
	}
	patch.NroCapVisto = &value
	return nil
}

// firstPresentField returns the raw JSON value of whichever candidate key is present in
// payload, preferring earlier candidates. Backs the SDD-55 additive English wire aliases:
// both the new and the Legacy-Spanish key name decode into the same patch field.
func firstPresentField(payload map[string]json.RawMessage, keys ...string) (json.RawMessage, bool) {
	for _, key := range keys {
		if raw, ok := payload[key]; ok {
			return raw, true
		}
	}
	return nil, false
}

// decodePatchLastWatched decodes and validates the last-watched timestamp.
func decodePatchLastWatched(payload map[string]json.RawMessage, patch *AnimePatch) error {
	raw, ok := payload["fechaUltCapVisto"]
	if !ok {
		return nil
	}
	var value int64
	if err := json.Unmarshal(raw, &value); err != nil || value < 0 {
		return errors.New("invalid fechaUltCapVisto")
	}
	patch.FechaUltCapVisto = &value
	return nil
}

// decodePatchDays decodes the scheduled days patch field, additively accepting the SDD-55
// English wire alias "days" alongside "dias".
func decodePatchDays(payload map[string]json.RawMessage, patch *AnimePatch) error {
	raw, ok := firstPresentField(payload, "days", "dias")
	if !ok {
		return nil
	}
	var value []string
	if err := json.Unmarshal(raw, &value); err != nil {
		return errors.New("invalid dias")
	}
	patch.Dias = value
	return nil
}

// decodeAnimePatchBase decodes the optional optimistic-concurrency token.
func decodeAnimePatchBase(payload map[string]json.RawMessage, patch AnimePatch) (AnimePatch, error) {
	raw, ok := payload["base"]
	if !ok {
		return patch, nil
	}
	var value int64
	if err := json.Unmarshal(raw, &value); err != nil {
		return AnimePatch{}, errors.New("invalid base")
	}
	patch.Base = &value
	return patch, nil
}

// isAnimeNotFound checks both the configured and standard not-found errors.
func isAnimeNotFound(err error, predicate func(error) bool) bool {
	if predicate != nil && predicate(err) {
		return true
	}

	return errors.Is(err, contracts.ErrAnimeNotFound)
}
