// Package cover resolves an anime's portada value (a local disk path, an
// http(s) URL, or an absent/"null" sentinel) into either cover image bytes
// or an explicit "use placeholder" signal, per the episodes-cover-pipeline
// spec.
package cover

import (
	"context"
	"errors"
	"time"
)

// Kind classifies a raw portada string by its shape alone, mirroring
// Legacy's indifference to the vestigial portada.type field.
type Kind int

const (
	// KindAbsent marks a missing or explicit null cover source.
	KindAbsent Kind = iota
	// KindURL marks a remote URL cover source.
	KindURL
	// KindLocalPath marks a local filesystem cover source.
	KindLocalPath
)

// nullSentinel is the literal string Legacy sometimes stores in place of an
// absent portada value.
const nullSentinel = "null"

var (
	urlSchemes = []string{"http://", "https://", "ftp://"}

	// ErrAbsent reports a cover source that was not supplied.
	ErrAbsent = errors.New("cover source absent")
	// ErrGone reports a cover source that cannot become available without a
	// source change, such as a missing local file or origin 4xx response.
	ErrGone = errors.New("cover source gone")
	// ErrInvalid reports source bytes that exceed the configured size limit or
	// are not an image.
	ErrInvalid = errors.New("cover source invalid")
	// ErrTransient reports an I/O or origin failure that may succeed later.
	ErrTransient = errors.New("cover source transient")
)

// Classify decides a portada value's Kind from its string shape only (scheme
// prefix), never the vestigial portada.type field. Exported: internal/anime
// (episode_service.go, a different package) imports it to compute HasCover
// without duplicating this string-shape rule.
func Classify(path string) Kind {
	if path == "" || path == nullSentinel {
		return KindAbsent
	}
	for _, scheme := range urlSchemes {
		if len(path) >= len(scheme) && path[:len(scheme)] == scheme {
			return KindURL
		}
	}
	return KindLocalPath
}

// FileInfo exposes the local metadata that forms a cover's stable identity.
type FileInfo interface {
	Size() int64
	ModTime() time.Time
}

// FileReader reads and stats a local disk file. The default production adapter
// wraps os.ReadFile and os.Stat.
type FileReader interface {
	ReadFile(path string) ([]byte, error)
	Stat(path string) (FileInfo, error)
}

// FetchResult is one origin response. Data is populated only for a successful
// 200 response; RetryAfterSeconds is populated only for origin 429 or 503.
type FetchResult struct {
	Data              []byte
	ContentType       string
	StatusCode        int
	RetryAfterSeconds int
}

// Fetcher downloads a URL's bytes over HTTP(S), honouring ctx cancellation.
// The default production adapter is httpFetcher.
type Fetcher interface {
	Fetch(ctx context.Context, url string) (FetchResult, error)
}

// Cache persists downloaded cover bytes keyed by an opaque string (the
// source URL). The default production adapter is diskCache.
type Cache interface {
	Get(key string) ([]byte, bool)
	Put(key string, data []byte) error
}

// SourceIdentity identifies a loaded source without transforming its bytes.
type SourceIdentity struct {
	LocalPath       string
	Size            int64
	ModTimeUnixNano int64
	OriginSHA256    string
}

// Source is valid loaded cover input for a later transform or compatibility
// adapter. RetryAfterSeconds is a sanitized origin estimate when available.
type Source struct {
	Bytes             []byte
	ContentType       string
	Kind              Kind
	Identity          SourceIdentity
	RetryAfterSeconds int
}

// Result is the transport-neutral outcome of a cover resolution; the App
// layer turns it into contracts.AnimeCover.
type Result struct {
	DataURL string
	IsCover bool
}
