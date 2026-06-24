package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

type PatchAnimeConfig struct {
	Authenticate AuthenticateFunc
	QueryAnime   QueryAnimeFunc
	PatchAnime   PatchAnimeFunc
	IsNotFound   func(error) bool
}

func NewPatchAnimeHandler(config PatchAnimeConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.Authenticate != nil {
			if _, ok := config.Authenticate(w, r); !ok {
				return
			}
		}

		animeID := strings.TrimPrefix(r.URL.Path, "/api/animes/")
		if animeID == "" || animeID == r.URL.Path {
			http.NotFound(w, r)
			return
		}

		patch, err := decodeAnimePatch(r)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		effectiveAnime, err := config.QueryAnime(r.Context(), animeID)
		if err != nil {
			if isAnimeNotFound(err, config.IsNotFound) {
				writeJSONError(w, http.StatusNotFound, "anime not found")
				return
			}

			writeJSONError(w, http.StatusInternalServerError, "query anime failed")
			return
		}

		patch = domain.ApplyCompletionStateMachine(patch, effectiveAnime.TotalCap)
		if err := config.PatchAnime(r.Context(), animeID, patch); err != nil {
			if isAnimeNotFound(err, config.IsNotFound) {
				writeJSONError(w, http.StatusNotFound, "anime not found")
				return
			}

			writeJSONError(w, http.StatusInternalServerError, "patch anime failed")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

func decodeAnimePatch(r *http.Request) (AnimePatch, error) {
	var payload map[string]json.RawMessage
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return AnimePatch{}, errors.New("invalid request body")
	}

	var patch AnimePatch
	if rawEstado, ok := payload["estado"]; ok {
		var estado int
		if err := json.Unmarshal(rawEstado, &estado); err != nil || estado < 0 || estado > 3 {
			return AnimePatch{}, errors.New("invalid estado")
		}
		patch.Estado = &estado
	}

	if rawNroCapVisto, ok := payload["nrocapvisto"]; ok {
		var nroCapVisto float64
		if err := json.Unmarshal(rawNroCapVisto, &nroCapVisto); err != nil || nroCapVisto < 0 {
			return AnimePatch{}, errors.New("invalid nrocapvisto")
		}
		patch.NroCapVisto = &nroCapVisto
	}

	if rawFechaUltCapVisto, ok := payload["fechaUltCapVisto"]; ok {
		var fechaUltCapVisto int64
		if err := json.Unmarshal(rawFechaUltCapVisto, &fechaUltCapVisto); err != nil || fechaUltCapVisto < 0 {
			return AnimePatch{}, errors.New("invalid fechaUltCapVisto")
		}
		patch.FechaUltCapVisto = &fechaUltCapVisto
	}

	if rawDias, ok := payload["dias"]; ok {
		var dias []string
		if err := json.Unmarshal(rawDias, &dias); err != nil {
			return AnimePatch{}, errors.New("invalid dias")
		}
		patch.Dias = dias
	}

	// SDD-30 ADR-30-2/30-5: base is the mobile client's last-known modified_at
	// OCC token. Absent from the wire entirely -> Base stays nil (old client,
	// safe-path semantics in WriteService.PatchAnime). Present -> decoded as-is,
	// including 0, which is a legitimate (pre-migration) token value.
	if rawBase, ok := payload["base"]; ok {
		var base int64
		if err := json.Unmarshal(rawBase, &base); err != nil {
			return AnimePatch{}, errors.New("invalid base")
		}
		patch.Base = &base
	}

	return patch, nil
}

func isAnimeNotFound(err error, predicate func(error) bool) bool {
	if predicate != nil && predicate(err) {
		return true
	}

	return errors.Is(err, contracts.ErrAnimeNotFound)
}
