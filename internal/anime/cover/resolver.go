package cover

import (
	"context"
	"encoding/base64"
	"fmt"
)

// defaultMaxBytes is the resolver's fallback size guard when a Resolver is
// constructed with maxBytes <= 0.
const defaultMaxBytes int64 = 10 * 1024 * 1024

var placeholderResult = Result{IsCover: false}

// Resolver implements the deterministic, placeholder-first cover resolution
// order (episodes-cover-pipeline spec, "Cover resolution follows a
// deterministic, placeholder-first order"). Every dependency is an
// interface so tests inject fakes at every boundary.
type Resolver struct {
	files    FileReader
	fetch    Fetcher
	cache    Cache
	maxBytes int64
}

// NewResolver wires a Resolver from its three ports plus a max-size guard in
// bytes (a value <= 0 falls back to defaultMaxBytes).
func NewResolver(files FileReader, fetch Fetcher, cache Cache, maxBytes int64) *Resolver {
	return &Resolver{files: files, fetch: fetch, cache: cache, maxBytes: maxBytes}
}

// Resolve turns a raw portada string into a Result. It preserves the existing
// placeholder contract by adapting every typed loading failure to no cover.
func (r *Resolver) Resolve(ctx context.Context, animeID, portadaPath string) Result {
	source, err := r.Load(ctx, portadaPath)
	if err != nil {
		return placeholderResult
	}
	return r.toDataURLResult(source.Bytes, source.ContentType)
}

// toDataURLResult converts cover bytes into a data URL result.
func (r *Resolver) toDataURLResult(data []byte, contentType string) Result {
	maxBytes := r.maxBytes
	if maxBytes <= 0 {
		maxBytes = defaultMaxBytes
	}
	if int64(len(data)) > maxBytes {
		return placeholderResult
	}
	mime, ok := imageMIME(contentType, data)
	if !ok {
		return placeholderResult
	}
	dataURL := fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))
	return Result{DataURL: dataURL, IsCover: true}
}
