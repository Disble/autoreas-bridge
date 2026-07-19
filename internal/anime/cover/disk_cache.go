package cover

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
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

func (c *diskCache) Put(key string, data []byte) error {
	if err := os.MkdirAll(c.root, 0o755); err != nil {
		return err
	}
	finalPath := c.entryPath(key)
	tmpPath := finalPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmpPath, finalPath)
}

// entryPath derives the cache filename for key: sha256(key) hex, suffixed
// ".img". The hash alone is a sufficient key (Put/Get only ever address a
// single cache instance by source URL); an anime-ID prefix is intentionally
// NOT included here since the Cache interface is anime-agnostic by design
// -- callers that want per-anime scoping fold the anime ID into key.
func (c *diskCache) entryPath(key string) string {
	sum := sha256.Sum256([]byte(key))
	return filepath.Join(c.root, fmt.Sprintf("%s.img", hex.EncodeToString(sum[:])))
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
