package contracts

import "context"

// CoverThumbnailStatus is the transport class of one cover fetch: served bytes, a
// permanent absence that mobile must treat as a placeholder, or a retryable failure.
type CoverThumbnailStatus int

// CoverThumbnailStatus values, ordered served then permanent then transient.
const (
	CoverThumbnailServed CoverThumbnailStatus = iota
	CoverThumbnailPermanent
	CoverThumbnailTransient
)

// CoverThumbnail is one servable cover thumbnail: the JPEG body, its strong ETag,
// and the origin's retry estimate when one is estimable (0 otherwise).
type CoverThumbnail struct {
	Bytes             []byte
	ETag              string
	RetryAfterSeconds int
}

// CoverThumbnailService supplies cover thumbnails to the transport layer, keeping
// the cover package's own error vocabulary out of the HTTP contract.
type CoverThumbnailService interface {
	GetCoverThumbnail(ctx context.Context, source string) (CoverThumbnail, CoverThumbnailStatus)
}
