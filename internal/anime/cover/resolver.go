package cover

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
)

// defaultMaxBytes is the resolver's fallback size guard when a Resolver is
// constructed with maxBytes <= 0.
const defaultMaxBytes int64 = 10 * 1024 * 1024

var placeholderResult = Result{IsCover: false}

// Resolver implements the deterministic, placeholder-first cover resolution
// order (chapters-cover-pipeline spec, "Cover resolution follows a
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

// Resolve turns a raw portada string into a Result. It never returns an
// error: every failure/absence branch degrades to the placeholder signal.
func (r *Resolver) Resolve(ctx context.Context, animeID, portadaPath string) Result {
	switch Classify(portadaPath) {
	case KindLocalPath:
		return r.resolveLocal(portadaPath)
	case KindURL:
		return r.resolveURL(ctx, portadaPath)
	default:
		return placeholderResult
	}
}

func (r *Resolver) resolveLocal(path string) Result {
	if r.files == nil {
		return placeholderResult
	}
	data, err := r.files.ReadFile(path)
	if err != nil {
		return placeholderResult
	}
	// Local-disk sources are always read live and sniffed; there is no
	// transport Content-Type header to prefer, and per spec they are never
	// copied into the cache.
	return r.toDataURLResult(data, "")
}

func (r *Resolver) resolveURL(ctx context.Context, sourceURL string) Result {
	if r.cache != nil {
		if cached, ok := r.cache.Get(sourceURL); ok {
			return r.toDataURLResult(cached, "")
		}
	}
	if r.fetch == nil {
		return placeholderResult
	}
	data, contentType, err := r.fetch.Fetch(ctx, sourceURL)
	if err != nil {
		return placeholderResult
	}
	result := r.toDataURLResult(data, contentType)
	if !result.IsCover {
		// Guardrail rejection (non-image, oversize) must not poison the
		// cache, same as a network failure.
		return placeholderResult
	}
	if r.cache != nil {
		_ = r.cache.Put(sourceURL, data)
	}
	return result
}

func (r *Resolver) toDataURLResult(data []byte, contentType string) Result {
	maxBytes := r.maxBytes
	if maxBytes <= 0 {
		maxBytes = defaultMaxBytes
	}
	if int64(len(data)) > maxBytes {
		return placeholderResult
	}
	mime := contentType
	if mime == "" {
		mime = http.DetectContentType(data)
	}
	if !strings.HasPrefix(mime, "image/") {
		return placeholderResult
	}
	dataURL := fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))
	return Result{DataURL: dataURL, IsCover: true}
}
