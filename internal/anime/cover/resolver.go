package cover

// defaultMaxBytes is the resolver's fallback size guard when a Resolver is
// constructed with maxBytes <= 0.
const defaultMaxBytes int64 = 10 * 1024 * 1024

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
