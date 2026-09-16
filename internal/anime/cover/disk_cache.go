package cover

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
)

// diskCache is the default Cache adapter: a persistent, OS-appropriate
// directory keyed by a sha256 hash of the source URL so a changed URL never
// serves a stale image (episodes-cover-pipeline spec, "Cached covers
// persist across restarts").
type diskCache struct {
	root string
}

// NewDiskCache constructs a disk-backed Cache rooted at root. root is
// created (via os.MkdirAll) lazily on the first Put, not here, so a
// read-only or not-yet-existing root never fails construction.
func NewDiskCache(root string) *diskCache {
	return &diskCache{root: root}
}

func (c *diskCache) Get(key string) ([]byte, bool) {
	data, err := os.ReadFile(c.entryPath(key))
	if err != nil {
		return nil, false
	}
	return data, true
}

// Put persists data under key through a unique temp file, so concurrent writers of the same key never share one in-flight file.
func (c *diskCache) Put(key string, data []byte) error {
	if err := os.MkdirAll(c.root, 0o755); err != nil {
		return err
	}
	finalPath := c.entryPath(key)
	return writeOnceFile(c.root, filepath.Base(finalPath)+".*.tmp", finalPath, data)
}

// putOriginSHA256 persists a URL source's origin-byte SHA-256 write-once beside its raw cache entry (design D4's "<sha256(url)>.sha256").
func (c *diskCache) putOriginSHA256(key, sha256Hex string) error {
	if err := os.MkdirAll(c.root, 0o755); err != nil {
		return err
	}
	finalPath := c.sidecarPath(key)
	return writeOnceFile(c.root, filepath.Base(finalPath)+".*.tmp", finalPath, []byte(sha256Hex))
}

// originSHA256 reads key's persisted origin-identity sidecar; ok is false for a pre-SDD-74 entry awaiting lazy migration.
func (c *diskCache) originSHA256(key string) (string, bool) {
	data, err := os.ReadFile(c.sidecarPath(key))
	if err != nil {
		return "", false
	}
	return string(data), true
}

// entryPath derives the cache filename for key: sha256(key) hex, suffixed
// ".img". The hash alone is a sufficient key (Put/Get only ever address a
// single cache instance by source URL); an anime-ID prefix is intentionally
// NOT included here since the Cache interface is anime-agnostic by design
// -- callers that want per-anime scoping fold the anime ID into key.
func (c *diskCache) entryPath(key string) string {
	return filepath.Join(c.root, hashKey(key)+".img")
}

// sidecarPath derives the origin-identity sidecar filename beside key's ".img" entry.
func (c *diskCache) sidecarPath(key string) string {
	return filepath.Join(c.root, hashKey(key)+".sha256")
}

// hashKey is the sha256(key) hex digest shared by every diskCache filename.
func hashKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

// DefaultCacheRoot wraps os.UserCacheDir() + "autoreas-bridge/covers" for
// production wiring. It returns the error (never panicking) so callers can
// degrade gracefully (Slice 2.3's NewDefaultResolver falls back to a no-op
// cache on failure).
func DefaultCacheRoot() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "autoreas-bridge", "covers"), nil
}
