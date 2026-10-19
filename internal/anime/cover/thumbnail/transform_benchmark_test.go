package thumbnail_test

import (
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime/cover/thumbnail"
)

// BenchmarkTransformCorpus measures the v2 transform against the real cover corpus copied to
// THUMBNAIL_BENCH_CORPUS (never committed). Every cover takes the same single generated path, because
// v2 re-encodes a source at or below the ceiling instead of serving it byte-for-byte.
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
		if len(result.Bytes) == 0 {
			b.Fatalf("transform cover %s produced no bytes", entry.Name())
		}
		// Transform is pure, and the call above proved these exact bytes succeed.
		b.Run(entry.Name(), func(b *testing.B) {
			for b.Loop() {
				_, _ = thumbnail.Transform(data, thumbnail.Options{})
			}
		})
	}
}
