package cover

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strings"
)

// Load retrieves a raw cover source and preserves its outcome class for callers
// that need to distinguish permanent absence from retryable I/O failures.
func (r *Resolver) Load(ctx context.Context, path string) (Source, error) {
	switch Classify(path) {
	case KindAbsent:
		return Source{}, ErrAbsent
	case KindLocalPath:
		return r.loadLocal(path)
	case KindURL:
		return r.loadURL(ctx, path)
	default:
		return Source{}, ErrTransient
	}
}

// loadLocal reads a local source after collecting the metadata that identifies its bytes for
// later thumbnail caching, and best-effort keeps a last-good copy so a source deleted after a
// successful load can still be served (offline-first: see localFallback and saveLocalLastGood).
func (r *Resolver) loadLocal(path string) (Source, error) {
	if r.files == nil {
		return Source{}, ErrTransient
	}
	info, err := r.files.Stat(path)
	if err != nil {
		return r.localFallback(path, classifyLocalError("stat", err))
	}
	data, err := r.files.ReadFile(path)
	if err != nil {
		return r.localFallback(path, classifyLocalError("read", err))
	}
	if r.exceedsMax(data) {
		return Source{}, ErrInvalid
	}
	identity := SourceIdentity{
		LocalPath:       path,
		Size:            info.Size(),
		ModTimeUnixNano: info.ModTime().UnixNano(),
	}
	r.saveLocalLastGood(path, data, identity)
	return Source{Bytes: data, Kind: KindLocalPath, Identity: identity}, nil
}

// localCopyStore is a Cache that also persists a best-effort last-good copy of a local-file
// source, so a deleted original still serves its most recently loaded bytes under their original
// identity (offline-first); the production diskCache implements it, a fake test Cache safely does
// not.
type localCopyStore interface {
	getLocalLastGood(path string) ([]byte, SourceIdentity, bool)
	putLocalLastGood(path string, data []byte, identity SourceIdentity) error
}

// localFallback serves path's last-good copy when classified is the not-exist case (ErrGone) and a
// copy is on record, and otherwise returns classified unchanged: a transient error never falls back
// to a possibly stale copy, and an ErrGone with no copy on record behaves exactly as before.
func (r *Resolver) localFallback(path string, classified error) (Source, error) {
	if !errors.Is(classified, ErrGone) {
		return Source{}, classified
	}
	store, ok := r.cache.(localCopyStore)
	if !ok {
		return Source{}, classified
	}
	data, identity, ok := store.getLocalLastGood(path)
	if !ok {
		return Source{}, classified
	}
	return Source{Bytes: data, Kind: KindLocalPath, Identity: identity}, nil
}

// saveLocalLastGood best-effort persists a successfully loaded local source as its last-good copy.
// A write failure is ignored, matching this package's existing convention for best-effort sidecar
// persistence (originIdentity's putOriginSHA256 below does the same).
func (r *Resolver) saveLocalLastGood(path string, data []byte, identity SourceIdentity) {
	if store, ok := r.cache.(localCopyStore); ok {
		_ = store.putLocalLastGood(path, data, identity)
	}
}

// loadURL returns cached raw bytes when available or fetches and persists a
// complete origin response. Invalid or transient results never poison the cache.
func (r *Resolver) loadURL(ctx context.Context, url string) (Source, error) {
	if r.cache != nil {
		if data, ok := r.cache.Get(url); ok {
			if r.exceedsMax(data) {
				return Source{}, ErrInvalid
			}
			return newURLSource(data, r.originIdentity(url, data), ""), nil
		}
	}
	if r.fetch == nil {
		return Source{}, ErrTransient
	}
	result, err := r.fetch.Fetch(ctx, url)
	if err != nil {
		return Source{Kind: KindURL, RetryAfterSeconds: result.RetryAfterSeconds}, classifyFetchError(err)
	}
	if r.exceedsMax(result.Data) {
		return Source{}, ErrInvalid
	}
	if _, ok := imageMIME(result.ContentType, result.Data); !ok {
		return Source{}, ErrInvalid
	}
	if r.cache != nil {
		if err := r.cache.Put(url, result.Data); err != nil {
			return Source{}, fmt.Errorf("%w: persist fetched cover: %w", ErrTransient, err)
		}
	}
	source := newURLSource(result.Data, r.originIdentity(url, result.Data), result.ContentType)
	source.RetryAfterSeconds = result.RetryAfterSeconds
	return source, nil
}

// originIdentifier is a Cache that also persists the URL origin-byte SHA-256 sidecar (design D4); the production diskCache implements it, a fake test Cache safely does not.
type originIdentifier interface {
	originSHA256(key string) (string, bool)
	putOriginSHA256(key, sha256Hex string) error
}

// originIdentity returns a URL source's origin-byte SHA-256 identity, reusing a persisted sidecar when the cache keeps one and write-once persisting the first identity it computes (design D2.3/D2.5).
func (r *Resolver) originIdentity(url string, data []byte) string {
	sc, ok := r.cache.(originIdentifier)
	if ok {
		if sha, hit := sc.originSHA256(url); hit {
			return sha
		}
	}
	sum := sha256.Sum256(data)
	sha := fmt.Sprintf("%x", sum)
	if ok {
		_ = sc.putOriginSHA256(url, sha)
	}
	return sha
}

// exceedsMax applies the resolver's fallback size guard consistently to local,
// cached, and fetched source bytes.
func (r *Resolver) exceedsMax(data []byte) bool {
	maxBytes := r.maxBytes
	if maxBytes <= 0 {
		maxBytes = defaultMaxBytes
	}
	return int64(len(data)) > maxBytes
}

// imageMIME prefers the origin's declared media type and sniffs unlabelled
// bytes, so a non-image body is rejected before it can reach the cache.
func imageMIME(contentType string, data []byte) (string, bool) {
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	return contentType, strings.HasPrefix(contentType, "image/")
}

// newURLSource builds a URL Source carrying the given origin-byte identity.
func newURLSource(data []byte, originIdentity, contentType string) Source {
	return Source{
		Bytes:       data,
		ContentType: contentType,
		Kind:        KindURL,
		Identity:    SourceIdentity{OriginSHA256: originIdentity},
	}
}

// classifyLocalError maps a filesystem failure without relying on its text.
func classifyLocalError(operation string, err error) error {
	if errors.Is(err, fs.ErrNotExist) || os.IsNotExist(err) {
		return fmt.Errorf("%w: local cover %s: %w", ErrGone, operation, err)
	}
	return fmt.Errorf("%w: local cover %s: %w", ErrTransient, operation, err)
}

// classifyFetchError preserves known origin classes and safely treats an
// unclassified fetch-port failure as retryable.
func classifyFetchError(err error) error {
	switch {
	case errors.Is(err, ErrGone), errors.Is(err, ErrInvalid), errors.Is(err, ErrTransient):
		return err
	default:
		return fmt.Errorf("%w: fetch cover: %w", ErrTransient, err)
	}
}
