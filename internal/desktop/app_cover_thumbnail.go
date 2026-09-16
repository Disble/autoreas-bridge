package desktop

import (
	"context"
	"errors"

	"autoreas-bridge/internal/anime/cover"
	apiContracts "autoreas-bridge/internal/api/contracts"
)

// apiCoverThumbnails adapts the shared cover seam to the HTTP API's bounded port, mapping the
// cover package's typed outcomes onto the transport contract so the API layer never imports the
// cover package's error vocabulary.
type apiCoverThumbnails struct{ service coverThumbnails }

// GetCoverThumbnail serves one thumbnail for an HTTP caller through the bounded acquire: a served
// thumbnail, a permanent absence the route answers 204 for, or a transient failure it answers 503
// for with whatever retry estimate the origin supplied.
func (a apiCoverThumbnails) GetCoverThumbnail(ctx context.Context, source string) (apiContracts.CoverThumbnail, apiContracts.CoverThumbnailStatus) {
	result, err := a.service.GetHTTP(ctx, source)
	thumbnail := apiContracts.CoverThumbnail{Bytes: result.Bytes, ETag: result.ETag, RetryAfterSeconds: result.RetryAfterSeconds}
	switch {
	case err == nil:
		return thumbnail, apiContracts.CoverThumbnailServed
	case errors.Is(err, cover.ErrAbsent), errors.Is(err, cover.ErrGone), errors.Is(err, cover.ErrInvalid):
		return thumbnail, apiContracts.CoverThumbnailPermanent
	default:
		return thumbnail, apiContracts.CoverThumbnailTransient
	}
}
