package handlers

import (
	"net/http"
	"strconv"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

// AnimeCoverConfig wires the cover endpoint: the authentication seam, the mobile
// anime lookup seam, the thumbnail port, and the not-found classifier (the package's
// shared isAnimeNotFound handles a nil classifier). Both the lookup and the
// thumbnail seams are nil-safe: an unwired bridge reports 503 rather than pretending
// it can serve anything.
type AnimeCoverConfig struct {
	Authenticate    AuthenticateFunc
	GetMobileAnime  GetMobileAnimeFunc
	CoverThumbnails contracts.CoverThumbnailService
	IsAnimeNotFound func(error) bool
}

// NewAnimeCoverHandler serves GET /api/animes/{id}/cover in the mobile contract's
// ordered decisions: 405 for any other method (HEAD included) before 401, 503 for
// an unwired seam or a lookup failure, 404 for an unknown anime, 204 for a
// permanent cover absence, 304 for an exact strong ETag, 503 with Retry-After only
// when the origin estimates one, and 200 with the JPEG body otherwise.
func NewAnimeCoverHandler(config AnimeCoverConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if _, ok := authenticateAnimeCover(w, r, config.Authenticate); !ok {
			return
		}
		if config.GetMobileAnime == nil || config.CoverThumbnails == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "cover thumbnails unavailable")
			return
		}
		source, ok := coverSource(w, r, config)
		if !ok {
			return
		}
		thumbnail, status := config.CoverThumbnails.GetCoverThumbnail(r.Context(), source)
		writeCoverOutcome(w, r, thumbnail, status)
	})
}

// coverSource resolves the requested anime's cover source, answering 404 for an unknown
// anime, 503 for a lookup failure and 204 for an absent cover, and reporting whether there
// is a source worth fetching.
func coverSource(w http.ResponseWriter, r *http.Request, config AnimeCoverConfig) (string, bool) {
	anime, err := config.GetMobileAnime(r.Context(), r.PathValue("id"))
	if err != nil {
		if isAnimeNotFound(err, config.IsAnimeNotFound) {
			writeJSONError(w, http.StatusNotFound, "anime not found")
			return "", false
		}
		writeJSONError(w, http.StatusServiceUnavailable, "get anime failed")
		return "", false
	}
	if anime == nil || anime.Cover == nil {
		w.WriteHeader(http.StatusNoContent)
		return "", false
	}
	return *anime.Cover, true
}

// writeCoverOutcome maps one thumbnail outcome to its response: 204 for a permanent
// absence, 503 carrying Retry-After only when the origin estimates one, and otherwise the
// servable thumbnail.
func writeCoverOutcome(w http.ResponseWriter, r *http.Request, thumbnail contracts.CoverThumbnail, status contracts.CoverThumbnailStatus) {
	switch status {
	case contracts.CoverThumbnailPermanent:
		w.WriteHeader(http.StatusNoContent)
	case contracts.CoverThumbnailTransient:
		if thumbnail.RetryAfterSeconds > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(thumbnail.RetryAfterSeconds))
		}
		writeJSONError(w, http.StatusServiceUnavailable, "cover unavailable")
	default:
		writeCoverThumbnail(w, r, thumbnail)
	}
}

// authenticateAnimeCover authenticates a cover request, treating a nil seam as
// already-authenticated -- the nil-safe convention every handler here follows.
func authenticateAnimeCover(w http.ResponseWriter, r *http.Request, authenticate AuthenticateFunc) (device.PairedDevice, bool) {
	if authenticate == nil {
		return device.PairedDevice{}, true
	}
	return authenticate(w, r)
}

// writeCoverThumbnail answers a servable thumbnail: an exact strong ETag match
// revalidates with 304 and no body; otherwise the JPEG body is sent with its strong
// validator and length. The comparison is deliberately exact, so a weak or
// malformed If-None-Match never becomes a match.
func writeCoverThumbnail(w http.ResponseWriter, r *http.Request, thumbnail contracts.CoverThumbnail) {
	if r.Header.Get("If-None-Match") == thumbnail.ETag {
		w.Header().Set("ETag", thumbnail.ETag)
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("ETag", thumbnail.ETag)
	w.Header().Set("Content-Length", strconv.Itoa(len(thumbnail.Bytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(thumbnail.Bytes)
}
