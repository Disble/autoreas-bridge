package cover

import (
	"context"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/cover/thumbnail"
	"autoreas-bridge/internal/observability/syncdiag"
)

// defaultHTTPAcquireWait is the production bounded-acquire duration; only the fixed Retry-After:5 on saturation is a mobile wire contract, not this value (design D5).
const defaultHTTPAcquireWait = 3 * time.Second

// errSaturated marks a bounded acquire that timed out with both slots still held, distinct from an outer context cancellation.
var errSaturated = errors.New("thumbnail: slots saturated")

// sourceLoader loads raw cover bytes and identity; *Resolver satisfies it in production, a fake in tests.
type sourceLoader interface {
	Load(ctx context.Context, path string) (Source, error)
}

// thumbnailStore persists and retrieves versioned derived-cache entries; *thumbnailCache satisfies it in production.
type thumbnailStore interface {
	get(specVersion int, identity SourceIdentity) (data []byte, etag string, ok bool)
	put(specVersion int, identity SourceIdentity, data []byte, etag string) error
}

// transformFunc generates a thumbnail from source bytes; thumbnail.Transform in production, faked in tests for deterministic slot contention.
type transformFunc func(data []byte, opts thumbnail.Options) (thumbnail.Result, error)

// ThumbnailResult is a generated or cached thumbnail ready to serve; on a transient error only RetryAfterSeconds may be set (0 when not estimable).
type ThumbnailResult struct {
	Bytes             []byte
	ETag              string
	RetryAfterSeconds int
}

// ThumbnailService composes source loading, the versioned derived cache, and the pure v1 transform behind a two-slot gate that bounds only decode/resize/encode (design D5).
type ThumbnailService struct {
	load            sourceLoader
	store           thumbnailStore
	transform       transformFunc
	slots           chan struct{}
	httpAcquireWait time.Duration
}

// NewThumbnailService wires loader, a versioned cache rooted at cacheRoot, the pure transform, and a fresh two-slot gate at the production httpAcquireWait.
func NewThumbnailService(loader *Resolver, cacheRoot string) *ThumbnailService {
	slots := make(chan struct{}, 2)
	slots <- struct{}{}
	slots <- struct{}{}
	return &ThumbnailService{
		load:            loader,
		store:           newThumbnailCache(cacheRoot),
		transform:       thumbnail.Transform,
		slots:           slots,
		httpAcquireWait: defaultHTTPAcquireWait,
	}
}

// GetHTTP resolves path's thumbnail for an HTTP caller: acquiring a slot waits only up to httpAcquireWait, then reports saturated instead of blocking indefinitely.
func (s *ThumbnailService) GetHTTP(ctx context.Context, path string) (ThumbnailResult, error) {
	return s.get(ctx, path, s.acquireBounded)
}

// GetDesktop resolves path's thumbnail for the desktop UI binding: it waits for a slot rather than failing fast, matching the existing session-long placeholder contract.
func (s *ThumbnailService) GetDesktop(ctx context.Context, path string) (ThumbnailResult, error) {
	return s.get(ctx, path, s.acquireWaiting)
}

// get loads the source, serves a versioned cache hit without a slot, or acquires one via acquire to run the bounded transform work.
func (s *ThumbnailService) get(ctx context.Context, path string, acquire func(context.Context) error) (ThumbnailResult, error) {
	source, err := s.load.Load(ctx, path)
	if err != nil {
		return ThumbnailResult{RetryAfterSeconds: source.RetryAfterSeconds}, err
	}

	if data, etag, ok := s.store.get(thumbnail.SpecVersion, source.Identity); ok {
		return ThumbnailResult{Bytes: data, ETag: etag}, nil
	}

	if err := acquire(ctx); err != nil {
		if errors.Is(err, errSaturated) {
			return ThumbnailResult{RetryAfterSeconds: syncdiag.RetryAfterSecs}, fmt.Errorf("%w: thumbnail slots saturated", ErrTransient)
		}
		return ThumbnailResult{}, fmt.Errorf("%w: acquire thumbnail slot: %w", ErrTransient, err)
	}
	result, err := s.transform(source.Bytes, thumbnail.Options{})
	s.release()
	if err != nil {
		return ThumbnailResult{}, fmt.Errorf("%w: %w", ErrInvalid, err)
	}

	if err := s.store.put(thumbnail.SpecVersion, source.Identity, result.Bytes, result.ETag); err != nil {
		return ThumbnailResult{}, fmt.Errorf("%w: persist thumbnail: %w", ErrTransient, err)
	}
	return ThumbnailResult{Bytes: result.Bytes, ETag: result.ETag}, nil
}

// acquireBounded waits up to s.httpAcquireWait for a slot, reporting errSaturated if none frees in time.
func (s *ThumbnailService) acquireBounded(ctx context.Context) error {
	bounded, cancel := context.WithTimeout(ctx, s.httpAcquireWait)
	defer cancel()
	select {
	case <-s.slots:
		return nil
	case <-bounded.Done():
		return errSaturated
	}
}

// acquireWaiting waits for a slot without a bound, only failing on ctx cancellation.
func (s *ThumbnailService) acquireWaiting(ctx context.Context) error {
	select {
	case <-s.slots:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// release returns a slot to the gate.
func (s *ThumbnailService) release() {
	s.slots <- struct{}{}
}
