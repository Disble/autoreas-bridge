package thumbnail_test

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime/cover/thumbnail"
)

// BenchmarkTransformCorpus measures the v1 transform against the real cover corpus copied to
// THUMBNAIL_BENCH_CORPUS (never committed). Each sub-benchmark is named after the cover and the
// path it takes, so the run is itself the ADR-024 resampler receipt.
func BenchmarkTransformCorpus(b *testing.B) {
	dir := os.Getenv("THUMBNAIL_BENCH_CORPUS")
	if dir == "" {
		b.Skip("THUMBNAIL_BENCH_CORPUS is unset; the real cover corpus is never committed")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		b.Fatalf("read corpus: %v", err)
	}
	for _, entry := range entries {
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			b.Fatalf("read cover %s: %v", entry.Name(), err)
		}
		result, err := thumbnail.Transform(data, thumbnail.Options{})
		if err != nil {
			b.Fatalf("transform cover %s: %v", entry.Name(), err)
		}
		path := "generated"
		if bytes.Equal(result.Bytes, data) {
			path = "pass-through"
		}
		// Transform is pure, and the call above proved these exact bytes succeed.
		b.Run(fmt.Sprintf("%s/%s", entry.Name(), path), func(b *testing.B) {
			for b.Loop() {
				_, _ = thumbnail.Transform(data, thumbnail.Options{})
			}
		})
	}
}
