package cover

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// localLastGoodMeta is the write-once pointer for one local path's last-good copy: it is the only
// file this feature ever replaces, and it always names a content file that already exists and is
// complete before the pointer is republished (mirrors thumbnailCache's metadata-last commit order,
// so a concurrent reader can never observe a torn pair).
type localLastGoodMeta struct {
	LocalPath       string `json:"localPath"`
	Size            int64  `json:"size"`
	ModTimeUnixNano int64  `json:"modTimeUnixNano"`
	ContentFile     string `json:"contentFile"`
}

// localLastGoodDir is the subdirectory holding every local path's pointer and content files,
// created lazily on first write (offline-first fallback for a deleted local cover source).
func (c *diskCache) localLastGoodDir() string {
	return filepath.Join(c.root, "local-last-good")
}

// localLastGoodPointerPath names path's pointer file by sha256(path) hex, so the raw path never
// appears on disk (matching entryPath's convention).
func (c *diskCache) localLastGoodPointerPath(path string) string {
	return filepath.Join(c.localLastGoodDir(), hashKey(path)+".json")
}

// localLastGoodContentName derives one generation's content-addressed filename from path and the
// identity recorded for it. It never changes for the same (path, identity) pair, so the content
// file is written once and only the small pointer is ever replaced.
func localLastGoodContentName(path string, identity SourceIdentity) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s|%d|%d", path, identity.Size, identity.ModTimeUnixNano)))
	return hex.EncodeToString(sum[:]) + ".img"
}

// readLocalLastGoodMeta loads and self-validates path's pointer: a pointer whose recorded identity
// does not reproduce its own ContentFile name is treated as absent, guarding against a corrupted
// or hand-edited pointer.
func (c *diskCache) readLocalLastGoodMeta(path string) (localLastGoodMeta, bool) {
	raw, err := os.ReadFile(c.localLastGoodPointerPath(path))
	if err != nil {
		return localLastGoodMeta{}, false
	}
	var meta localLastGoodMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return localLastGoodMeta{}, false
	}
	identity := SourceIdentity{Size: meta.Size, ModTimeUnixNano: meta.ModTimeUnixNano}
	if meta.ContentFile != localLastGoodContentName(path, identity) {
		return localLastGoodMeta{}, false
	}
	return meta, true
}

// getLocalLastGood returns path's last-good copy and the identity recorded when it was taken; ok is
// false unless the pointer and its named content file both exist and agree (design behaviour 2: a
// deleted original still serves its last good bytes under their original identity).
func (c *diskCache) getLocalLastGood(path string) ([]byte, SourceIdentity, bool) {
	meta, ok := c.readLocalLastGoodMeta(path)
	if !ok {
		return nil, SourceIdentity{}, false
	}
	data, err := os.ReadFile(filepath.Join(c.localLastGoodDir(), meta.ContentFile))
	if err != nil {
		return nil, SourceIdentity{}, false
	}
	return data, SourceIdentity{LocalPath: meta.LocalPath, Size: meta.Size, ModTimeUnixNano: meta.ModTimeUnixNano}, true
}

// putLocalLastGood best-effort persists data as path's new last-good copy under identity. It skips
// the write entirely when the pointer already records this exact identity (no disk write per
// request on an unchanged source), and otherwise writes the content file before republishing the
// pointer to name it, so a concurrent reader never observes a mismatched pair (design behaviour 1
// and the in-place replacement case).
func (c *diskCache) putLocalLastGood(path string, data []byte, identity SourceIdentity) error {
	if existing, ok := c.readLocalLastGoodMeta(path); ok && existing.Size == identity.Size && existing.ModTimeUnixNano == identity.ModTimeUnixNano {
		return nil
	}
	dir := c.localLastGoodDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	contentName := localLastGoodContentName(path, identity)
	if err := writeOnceFile(dir, contentName+".*.tmp", filepath.Join(dir, contentName), data); err != nil {
		return err
	}
	metaBytes, err := json.Marshal(localLastGoodMeta{LocalPath: path, Size: identity.Size, ModTimeUnixNano: identity.ModTimeUnixNano, ContentFile: contentName})
	if err != nil {
		return err
	}
	pointerPath := c.localLastGoodPointerPath(path)
	return writeOnceFile(dir, filepath.Base(pointerPath)+".*.tmp", pointerPath, metaBytes)
}
