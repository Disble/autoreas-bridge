package cover

import "os"

// osFileReader is the default FileReader adapter, wrapping os.ReadFile.
type osFileReader struct{}

func (osFileReader) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// noopCache is the degraded Cache used when DefaultCacheRoot() cannot be
// resolved (e.g. os.UserCacheDir() failure): every Get misses, every Put is
// a no-op. This keeps NewDefaultResolver's "must never panic" guarantee --
// URLs are still live-fetched (just never persisted) and local paths are
// unaffected (they never touch the cache regardless).
type noopCache struct{}

func (noopCache) Get(string) ([]byte, bool) { return nil, false }
func (noopCache) Put(string, []byte) error  { return nil }

// NewDefaultResolver wires a production Resolver: os.ReadFile-backed
// FileReader, a real HTTPFetcher, and a disk Cache rooted at
// DefaultCacheRoot(). A cache-root resolution failure degrades to noopCache
// (URLs live-fetch without persisting; local paths are unaffected) rather
// than failing construction, per the design's "must never panic" guarantee.
func NewDefaultResolver(maxBytes int64) *Resolver {
	if maxBytes <= 0 {
		maxBytes = defaultMaxBytes
	}

	var cache Cache = noopCache{}
	if root, err := DefaultCacheRoot(); err == nil {
		cache = NewDiskCache(root)
	}

	return NewResolver(osFileReader{}, NewHTTPFetcher(defaultFetchTimeout, maxBytes), cache, maxBytes)
}
