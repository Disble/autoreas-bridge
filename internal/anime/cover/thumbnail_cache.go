package cover

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// thumbnailMetadata is the write-once commit marker for one derived thumbnail entry: a hit requires it to exist and name exactly the JPEG beside it.
type thumbnailMetadata struct {
	ETag     string `json:"etag"`
	Filename string `json:"filename"`
}

// thumbnailCache is the versioned, write-once derived-cache adapter: <root>/thumbs/v<spec>/<key>.jpg plus its <key>.json metadata commit marker (design D4).
type thumbnailCache struct {
	root string
}

// newThumbnailCache roots a thumbnailCache at <coverCacheRoot>/thumbs, created lazily on first write.
func newThumbnailCache(coverCacheRoot string) *thumbnailCache {
	return &thumbnailCache{root: filepath.Join(coverCacheRoot, "thumbs")}
}

// versionDir is the on-disk directory for one spec version's entries.
func (c *thumbnailCache) versionDir(specVersion int) string {
	return filepath.Join(c.root, fmt.Sprintf("v%d", specVersion))
}

// thumbnailIdentityKey canonically encodes a SourceIdentity: a URL source is its origin SHA-256, a local source is its path, size, and nanosecond mtime.
func thumbnailIdentityKey(identity SourceIdentity) string {
	if identity.OriginSHA256 != "" {
		return "url:" + identity.OriginSHA256
	}
	return fmt.Sprintf("local:%s:%d:%d", identity.LocalPath, identity.Size, identity.ModTimeUnixNano)
}

// thumbnailCacheKey hashes the spec version with the source identity, so a local replacement or a version bump can never reuse a stale entry.
func thumbnailCacheKey(specVersion int, identity SourceIdentity) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("v%d|%s", specVersion, thumbnailIdentityKey(identity))))
	return hex.EncodeToString(sum[:])
}

// get returns a previously published thumbnail; ok is false unless the metadata commit marker and its named JPEG both exist and agree.
func (c *thumbnailCache) get(specVersion int, identity SourceIdentity) (data []byte, etag string, ok bool) {
	key := thumbnailCacheKey(specVersion, identity)
	dir := c.versionDir(specVersion)

	metaBytes, err := os.ReadFile(filepath.Join(dir, key+".json"))
	if err != nil {
		return nil, "", false
	}
	var meta thumbnailMetadata
	if err := json.Unmarshal(metaBytes, &meta); err != nil || meta.Filename != key+".jpg" {
		return nil, "", false
	}
	imgBytes, err := os.ReadFile(filepath.Join(dir, meta.Filename))
	if err != nil {
		return nil, "", false
	}
	return imgBytes, meta.ETag, true
}

// put publishes a thumbnail write-once: the JPEG lands under its final name before the metadata commit marker does (design D4).
func (c *thumbnailCache) put(specVersion int, identity SourceIdentity, data []byte, etag string) error {
	key := thumbnailCacheKey(specVersion, identity)
	dir := c.versionDir(specVersion)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	imgName := key + ".jpg"
	if err := writeOnceFile(dir, imgName+".*.tmp", filepath.Join(dir, imgName), data); err != nil {
		return err
	}

	metaBytes, err := json.Marshal(thumbnailMetadata{ETag: etag, Filename: imgName})
	if err != nil {
		return err
	}
	metaName := key + ".json"
	return writeOnceFile(dir, metaName+".*.tmp", filepath.Join(dir, metaName), metaBytes)
}

// cleanup best-effort removes every non-current thumbs/v* directory and any expired .tmp file in the current version; failure never breaks an existing valid entry (design D4).
func (c *thumbnailCache) cleanup(currentVersion int, tempMaxAge time.Duration) error {
	entries, err := os.ReadDir(c.root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	currentName := fmt.Sprintf("v%d", currentVersion)
	now := time.Now()
	var firstErr error
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(c.root, entry.Name())
		if entry.Name() == currentName {
			recordFirstError(&firstErr, sweepExpiredTemp(path, now, tempMaxAge))
			continue
		}
		recordFirstError(&firstErr, os.RemoveAll(path))
	}
	return firstErr
}

// sweepExpiredTemp removes ".tmp"-suffixed files older than maxAge from dir.
func sweepExpiredTemp(dir string, now time.Time, maxAge time.Duration) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var firstErr error
	for _, entry := range entries {
		recordFirstError(&firstErr, removeExpiredTemp(dir, entry, now, maxAge))
	}
	return firstErr
}

// recordFirstError sets *firstErr to err only if unset; assigning nil to an already-nil *firstErr is a no-op, so the first real failure always wins.
func recordFirstError(firstErr *error, err error) {
	if *firstErr == nil {
		*firstErr = err
	}
}

// removeExpiredTemp removes entry from dir when it is a ".tmp" file older than maxAge; anything else is left untouched.
func removeExpiredTemp(dir string, entry os.DirEntry, now time.Time, maxAge time.Duration) error {
	if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".tmp") {
		return nil
	}
	info, err := entry.Info()
	if err != nil {
		return err
	}
	if now.Sub(info.ModTime()) <= maxAge {
		return nil
	}
	return os.Remove(filepath.Join(dir, entry.Name()))
}
