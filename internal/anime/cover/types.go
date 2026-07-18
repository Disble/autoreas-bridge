// Package cover resolves an anime's portada value (a local disk path, an
// http(s) URL, or an absent/"null" sentinel) into either cover image bytes
// or an explicit "use placeholder" signal, per the chapters-cover-pipeline
// spec. It never returns an error to the caller: every failure or absence
// degrades to the placeholder signal, since a missing cover is normal, not
// exceptional.
package cover

import "context"

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

var urlSchemes = []string{"http://", "https://", "ftp://"}

// Classify decides a portada value's Kind from its string shape only (scheme
// prefix), never the vestigial portada.type field. Exported: internal/anime
// (chapter_service.go, a different package) imports it to compute HasCover
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

// FileReader reads a local disk file's bytes. The default production
// adapter wraps os.ReadFile.
type FileReader interface {
	ReadFile(path string) ([]byte, error)
}

// Fetcher downloads a URL's bytes over HTTP(S), honouring ctx cancellation.
// The default production adapter is httpFetcher.
type Fetcher interface {
	Fetch(ctx context.Context, url string) (data []byte, contentType string, err error)
}

// Cache persists downloaded cover bytes keyed by an opaque string (the
// source URL). The default production adapter is diskCache.
type Cache interface {
	Get(key string) ([]byte, bool)
	Put(key string, data []byte) error
}

// Result is the transport-neutral outcome of a cover resolution; the App
// layer turns it into contracts.AnimeCover.
type Result struct {
	DataURL string
	IsCover bool
}
