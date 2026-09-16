package api

import (
	"context"
	"errors"
	"net/http"

	apiHandlers "autoreas-bridge/internal/api/handlers"
)

// buildAnimeCoverHandler creates the cover handler; a nil thumbnail seam still
// builds it so it reports 503 itself, matching NewAnimeCoverHandler's nil-safe
// contract. The anime lookup keeps this package's own not-found classification,
// so the cover package's error vocabulary stays behind the port.
func buildAnimeCoverHandler(h *Handler, config Config) http.Handler {
	coverConfig := apiHandlers.AnimeCoverConfig{
		Authenticate:    h.authenticate,
		CoverThumbnails: config.CoverThumbnails,
		IsAnimeNotFound: func(err error) bool { return errors.Is(err, ErrAnimeNotFound) },
	}
	if config.AnimeQuery != nil {
		coverConfig.GetMobileAnime = func(ctx context.Context, id string) (*apiHandlers.MobileAnime, error) {
			return config.AnimeQuery.GetMobileAnime(ctx, id)
		}
	}
	return apiHandlers.NewAnimeCoverHandler(coverConfig)
}
