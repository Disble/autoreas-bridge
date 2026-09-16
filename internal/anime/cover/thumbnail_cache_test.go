package cover

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestThumbnailCacheRequiresMetadataCommitMarker proves a hit requires the metadata commit marker to exist and name exactly the JPEG beside it (design D4).
func TestThumbnailCacheRequiresMetadataCommitMarker(t *testing.T) {
	t.Parallel()

	identity := SourceIdentity{LocalPath: `C:\anime\cover.jpg`, Size: 42, ModTimeUnixNano: 7}
	const specVersion = 1

	cases := []struct {
		name  string
		setup func(t *testing.T, c *thumbnailCache)
		want  bool
	}{
		{
			name: "jpeg without metadata is a miss",
			setup: func(t *testing.T, c *thumbnailCache) {
				dir := c.versionDir(specVersion)
				mustMkdirAll(t, dir)
				key := thumbnailCacheKey(specVersion, identity)
				mustWriteFile(t, filepath.Join(dir, key+".jpg"), []byte("partial"))
			},
		},
		{
			// "other.jpg" genuinely exists, so only the filename-agreement check -- never a missing file -- explains the miss.
			name: "metadata naming the wrong file is a miss",
			setup: func(t *testing.T, c *thumbnailCache) {
				dir := c.versionDir(specVersion)
				mustMkdirAll(t, dir)
				mustWriteFile(t, filepath.Join(dir, "other.jpg"), []byte("wrong-image"))
				key := thumbnailCacheKey(specVersion, identity)
				bad, err := json.Marshal(thumbnailMetadata{ETag: `"etag"`, Filename: "other.jpg"})
				if err != nil {
					t.Fatalf("Marshal: %v", err)
				}
				mustWriteFile(t, filepath.Join(dir, key+".json"), bad)
			},
		},
		{
			name:  "published entry agreeing on both files is a hit",
			setup: func(t *testing.T, c *thumbnailCache) { mustPut(t, c, specVersion, identity, "jpeg-bytes", `"etag"`) },
			want:  true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c := newThumbnailCache(t.TempDir())
			tc.setup(t, c)

			data, etag, ok := c.get(specVersion, identity)
			if ok != tc.want {
				t.Fatalf("get() ok = %v, want %v", ok, tc.want)
			}
			if tc.want && (string(data) != "jpeg-bytes" || etag != `"etag"`) {
				t.Fatalf("get() = %q, %q; want the published bytes and etag", data, etag)
			}
		})
	}
}

// TestThumbnailCacheSeparatesSpecVersions proves a version bump cannot reuse a prior version's entry and never disturbs it (spec "A Spec Version Change Invalidates Every Cached Thumbnail").
func TestThumbnailCacheSeparatesSpecVersions(t *testing.T) {
	t.Parallel()

	identity := SourceIdentity{OriginSHA256: strings.Repeat("a", 64)}
	c := newThumbnailCache(t.TempDir())

	mustPut(t, c, 1, identity, "v1-bytes", `"v1-etag"`)
	if _, _, ok := c.get(2, identity); ok {
		t.Fatal("expected spec version 2 to miss a v1-only entry")
	}

	mustPut(t, c, 2, identity, "v2-bytes", `"v2-etag"`)
	assertEntry(t, c, 1, identity, "v1-bytes", `"v1-etag"`)
	assertEntry(t, c, 2, identity, "v2-bytes", `"v2-etag"`)
}

// TestThumbnailCacheLocalIdentityChangeInvalidatesEntry proves a size/mtime change at the same path addresses a fresh, distinct entry (spec "Replacing a local file at the same path invalidates its cached thumbnail").
func TestThumbnailCacheLocalIdentityChangeInvalidatesEntry(t *testing.T) {
	t.Parallel()

	c := newThumbnailCache(t.TempDir())
	const path = `C:\anime\cover.jpg`
	original := SourceIdentity{LocalPath: path, Size: 100, ModTimeUnixNano: 1000}
	replaced := SourceIdentity{LocalPath: path, Size: 200, ModTimeUnixNano: 2000}

	mustPut(t, c, 1, original, "original-bytes", `"original-etag"`)
	if _, _, ok := c.get(1, replaced); ok {
		t.Fatal("expected a changed local identity to miss the stale entry")
	}

	mustPut(t, c, 1, replaced, "replaced-bytes", `"replaced-etag"`)
	assertEntry(t, c, 1, original, "original-bytes", `"original-etag"`)
	assertEntry(t, c, 1, replaced, "replaced-bytes", `"replaced-etag"`)
}

// TestThumbnailCacheCleansOldVersionAndExpiredTemp proves startup cleanup removes stale version dirs and expired temps, keeps fresh temps and the current entry, and never stops early on a stray file or the current version's own branch (design D4).
func TestThumbnailCacheCleansOldVersionAndExpiredTemp(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	c := newThumbnailCache(root)
	identity := SourceIdentity{LocalPath: "cover.jpg", Size: 1, ModTimeUnixNano: 1}
	mustPut(t, c, 1, identity, "current-bytes", `"current-etag"`)

	// "README.txt" sorts before every "v*" dir, proving a non-directory entry is skipped, not a loop stop.
	thumbsRoot := filepath.Join(root, "thumbs")
	mustWriteFile(t, filepath.Join(thumbsRoot, "README.txt"), []byte("not a version dir"))

	staleDir := filepath.Join(thumbsRoot, "v0")
	mustMkdirAll(t, staleDir)
	mustWriteFile(t, filepath.Join(staleDir, "old.jpg"), []byte("stale"))

	// "v2" sorts after current "v1", proving the current version's branch does not stop the loop early.
	trailingStaleDir := filepath.Join(thumbsRoot, "v2")
	mustMkdirAll(t, trailingStaleDir)
	mustWriteFile(t, filepath.Join(trailingStaleDir, "old.jpg"), []byte("stale"))

	currentDir := c.versionDir(1)
	expiredTemp := filepath.Join(currentDir, "expired.jpg.tmp")
	mustWriteFile(t, expiredTemp, []byte("expired"))
	old := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(expiredTemp, old, old); err != nil {
		t.Fatalf("Chtimes: %v", err)
	}
	freshTemp := filepath.Join(currentDir, "fresh.jpg.tmp")
	mustWriteFile(t, freshTemp, []byte("fresh"))

	if err := c.cleanup(1, time.Hour); err != nil {
		t.Fatalf("cleanup: %v", err)
	}

	if _, err := os.Stat(staleDir); !os.IsNotExist(err) {
		t.Fatalf("expected stale version directory removed, stat err = %v", err)
	}
	if _, err := os.Stat(trailingStaleDir); !os.IsNotExist(err) {
		t.Fatalf("expected the trailing stale version directory removed too, stat err = %v", err)
	}
	if _, err := os.Stat(expiredTemp); !os.IsNotExist(err) {
		t.Fatalf("expected expired temp file removed, stat err = %v", err)
	}
	if _, err := os.Stat(freshTemp); err != nil {
		t.Fatalf("expected fresh temp file kept, stat err = %v", err)
	}
	assertEntry(t, c, 1, identity, "current-bytes", `"current-etag"`)
}

// TestThumbnailCacheCleanupPreservesFirstFailureAmongMultipleFailures proves cleanup reports only the first observed failure, and degrades without breaking an unrelated valid entry, across every branch of its loop (design D4).
func TestThumbnailCacheCleanupPreservesFirstFailureAmongMultipleFailures(t *testing.T) {
	old := time.Now().Add(-2 * time.Hour)
	safe := SourceIdentity{LocalPath: "safe.jpg", Size: 2, ModTimeUnixNano: 2}
	cases := []struct {
		name    string
		wantSub string
		setup   func(t *testing.T, root string, c *thumbnailCache) []*os.File
	}{
		{
			name:    "a single locked stale directory degrades without breaking a valid entry",
			wantSub: "v0",
			setup: func(t *testing.T, root string, _ *thumbnailCache) []*os.File {
				return []*os.File{lockFile(t, filepath.Join(root, "thumbs", "v0", "locked.jpg"), time.Time{})}
			},
		},
		{
			name:    "two locked temp files in the current version keep the first",
			wantSub: "aaa",
			setup: func(t *testing.T, _ string, c *thumbnailCache) []*os.File {
				dir := c.versionDir(1)
				return []*os.File{
					lockFile(t, filepath.Join(dir, "aaa.jpg.tmp"), old),
					lockFile(t, filepath.Join(dir, "zzz.jpg.tmp"), old),
				}
			},
		},
		{
			name:    "a stale directory failure and the current version's own failure keep the stale one",
			wantSub: "v0",
			setup: func(t *testing.T, root string, c *thumbnailCache) []*os.File {
				return []*os.File{
					lockFile(t, filepath.Join(root, "thumbs", "v0", "locked.jpg"), time.Time{}),
					lockFile(t, filepath.Join(c.versionDir(1), "current.jpg.tmp"), old),
				}
			},
		},
		{
			name:    "two failing stale directories keep the first",
			wantSub: "v0",
			setup: func(t *testing.T, root string, _ *thumbnailCache) []*os.File {
				return []*os.File{
					lockFile(t, filepath.Join(root, "thumbs", "v0", "locked.jpg"), time.Time{}),
					lockFile(t, filepath.Join(root, "thumbs", "v2", "locked.jpg"), time.Time{}),
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			c := newThumbnailCache(root)
			mustPut(t, c, 1, safe, "safe-bytes", `"safe-etag"`)
			handles := tc.setup(t, root, c)
			defer func() {
				for _, h := range handles {
					_ = h.Close()
				}
			}()

			err := c.cleanup(1, time.Hour)
			if err == nil || !strings.Contains(err.Error(), tc.wantSub) {
				t.Fatalf("cleanup() error = %v, want it to name the first failure (%q)", err, tc.wantSub)
			}
			assertEntry(t, c, 1, safe, "safe-bytes", `"safe-etag"`)
		})
	}
}

// TestRemoveExpiredTempBoundary proves removeExpiredTemp's exact one-hour boundary and that it never removes a directory, even one named like a temp file (design D4).
func TestRemoveExpiredTempBoundary(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		isDir      bool
		age        time.Duration
		wantRemove bool
	}{
		{name: "younger than the max age is kept", age: 30 * time.Minute, wantRemove: false},
		{name: "exactly the max age is kept", age: time.Hour, wantRemove: false},
		{name: "older than the max age is removed", age: time.Hour + time.Second, wantRemove: true},
		{name: "a directory named like a temp file is never removed", isDir: true, age: time.Hour + time.Second, wantRemove: false},
	}
	for _, tc := range cases {
		dir := t.TempDir()
		path := filepath.Join(dir, "entry.jpg.tmp")
		if tc.isDir {
			mustMkdirAll(t, path)
		} else {
			mustWriteFile(t, path, []byte("x"))
		}
		now := time.Now()
		mtime := now.Add(-tc.age)
		if err := os.Chtimes(path, mtime, mtime); err != nil {
			t.Fatalf("%s: Chtimes: %v", tc.name, err)
		}
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) != 1 {
			t.Fatalf("%s: ReadDir(%q) = %v, %v; want exactly one entry", tc.name, dir, entries, err)
		}
		if err := removeExpiredTemp(dir, entries[0], now, time.Hour); err != nil {
			t.Fatalf("%s: removeExpiredTemp: %v", tc.name, err)
		}
		_, statErr := os.Stat(path)
		if removed := os.IsNotExist(statErr); removed != tc.wantRemove {
			t.Fatalf("%s: removed = %v, want %v", tc.name, removed, tc.wantRemove)
		}
	}
}

// TestThumbnailCacheConcurrentWritersServeIdenticalBytes proves real goroutines racing to publish one key all succeed and the cache serves the one immutable byte sequence (spec "Two concurrent generations of the same key both succeed").
func TestThumbnailCacheConcurrentWritersServeIdenticalBytes(t *testing.T) {
	t.Parallel()

	c := newThumbnailCache(t.TempDir())
	identity := SourceIdentity{OriginSHA256: strings.Repeat("b", 64)}
	const data, etag = "identical-bytes", `"identical-etag"`

	var wg sync.WaitGroup
	const writers = 4
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- c.put(1, identity, []byte(data), etag)
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent put: %v", err)
		}
	}
	assertEntry(t, c, 1, identity, data, etag)
}

// TestDiskCacheOriginSHA256PersistsForLazyMigration proves a pre-SDD-74 entry with no sidecar reports not-yet-migrated, and a persisted sidecar round-trips (design D2/D4).
func TestDiskCacheOriginSHA256PersistsForLazyMigration(t *testing.T) {
	t.Parallel()

	c := NewDiskCache(t.TempDir())
	const key = "https://cdn.example.com/cover.jpg"
	const sha = "1111111111111111111111111111111111111111111111111111111111111111"

	if _, ok := c.originSHA256(key); ok {
		t.Fatal("expected a pre-SDD-74 raw entry with no sidecar to report not yet migrated")
	}
	if err := c.putOriginSHA256(key, sha); err != nil {
		t.Fatalf("putOriginSHA256: %v", err)
	}
	got, ok := c.originSHA256(key)
	if !ok || got != sha {
		t.Fatalf("originSHA256() = %q, %v; want %q, true", got, ok, sha)
	}
}

// mustMkdirAll creates dir or fails the test immediately.
func mustMkdirAll(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll(%q): %v", dir, err)
	}
}

// mustWriteFile writes data to path or fails the test immediately.
func mustWriteFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("WriteFile(%q): %v", path, err)
	}
}

// mustPut calls c.put and fails the test immediately on error.
func mustPut(t *testing.T, c *thumbnailCache, specVersion int, identity SourceIdentity, data, etag string) {
	t.Helper()
	if err := c.put(specVersion, identity, []byte(data), etag); err != nil {
		t.Fatalf("put: %v", err)
	}
}

// assertEntry fails the test unless c.get(specVersion, identity) hits with exactly data and etag.
func assertEntry(t *testing.T, c *thumbnailCache, specVersion int, identity SourceIdentity, data, etag string) {
	t.Helper()
	got, gotETag, ok := c.get(specVersion, identity)
	if !ok || string(got) != data || gotETag != etag {
		t.Fatalf("get(%d) = %q, %q, %v; want %q, %q, true", specVersion, got, gotETag, ok, data, etag)
	}
}

// lockFile creates path (aged to mtime unless zero) and returns it open, which measurably blocks Remove/RemoveAll/Rename on this repo's Go/Windows toolchain until closed; it must not write after Chtimes since a write refreshes mtime.
func lockFile(t *testing.T, path string, mtime time.Time) *os.File {
	t.Helper()
	mustMkdirAll(t, filepath.Dir(path))
	mustWriteFile(t, path, []byte("locked"))
	if !mtime.IsZero() {
		if err := os.Chtimes(path, mtime, mtime); err != nil {
			t.Fatalf("Chtimes(%q): %v", path, err)
		}
	}
	handle, err := os.Open(path)
	if err != nil {
		t.Fatalf("Open(%q): %v", path, err)
	}
	return handle
}
