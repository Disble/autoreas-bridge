package cover_test

import (
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime/cover"
)

func TestDiskCachePutThenGetRoundTripsBytes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	c := cover.NewDiskCache(root)

	const key = "https://cdn.example.com/anime-1/cover.jpg"
	data := []byte("cover-bytes")
	if err := c.Put(key, data); err != nil {
		t.Fatalf("Put: %v", err)
	}

	got, ok := c.Get(key)
	if !ok {
		t.Fatal("expected Get to hit after Put")
	}
	if string(got) != string(data) {
		t.Fatalf("expected round-tripped bytes %q, got %q", data, got)
	}
}

func TestDiskCacheGetOnMissingKeyReturnsFalse(t *testing.T) {
	t.Parallel()

	c := cover.NewDiskCache(t.TempDir())

	_, ok := c.Get("https://cdn.example.com/never-cached.jpg")
	if ok {
		t.Fatal("expected miss on an unwritten key")
	}
}

func TestDiskCacheDistinctURLsForSameAnimeProduceDistinctFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	c := cover.NewDiskCache(root)

	if err := c.Put("https://cdn.example.com/a.jpg", []byte("a")); err != nil {
		t.Fatalf("Put a: %v", err)
	}
	if err := c.Put("https://cdn.example.com/b.jpg", []byte("b")); err != nil {
		t.Fatalf("Put b: %v", err)
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read cache root: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected two distinct cache files, got %d entries", len(entries))
	}
}

func TestDiskCacheChangedURLWritesNewKeyLeavingOldFileUntouched(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	c := cover.NewDiskCache(root)

	if err := c.Put("https://cdn.example.com/old.jpg", []byte("old-bytes")); err != nil {
		t.Fatalf("Put old: %v", err)
	}
	if err := c.Put("https://cdn.example.com/new.jpg", []byte("new-bytes")); err != nil {
		t.Fatalf("Put new: %v", err)
	}

	oldData, ok := c.Get("https://cdn.example.com/old.jpg")
	if !ok || string(oldData) != "old-bytes" {
		t.Fatalf("expected old key untouched, got %q ok=%v", oldData, ok)
	}
	newData, ok := c.Get("https://cdn.example.com/new.jpg")
	if !ok || string(newData) != "new-bytes" {
		t.Fatalf("expected new key readable, got %q ok=%v", newData, ok)
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read cache root: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected old and new keys to coexist as two files, got %d entries", len(entries))
	}
}

func TestDiskCachePutWritesAtomicallyAndFinalContentMatches(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	c := cover.NewDiskCache(root)

	const key = "https://cdn.example.com/atomic.jpg"
	data := []byte("atomic-bytes")
	if err := c.Put(key, data); err != nil {
		t.Fatalf("Put: %v", err)
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read cache root: %v", err)
	}
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) == ".tmp" {
			t.Fatalf("expected no leftover .tmp file after Put, found %q", entry.Name())
		}
	}

	got, ok := c.Get(key)
	if !ok || string(got) != string(data) {
		t.Fatalf("expected final content to match exactly after Put, got %q ok=%v", got, ok)
	}
}

func TestDefaultCacheRootReturnsAutoreasBridgeCoversSubtree(t *testing.T) {
	t.Parallel()

	root, err := cover.DefaultCacheRoot()
	if err != nil {
		// os.UserCacheDir() can fail in a sandboxed/CI environment; the
		// contract is "never panic", not "always succeed" -- an error here
		// is a legitimate, documented degradation path.
		t.Skipf("DefaultCacheRoot unavailable in this environment: %v", err)
	}
	if filepath.Base(root) != "covers" {
		t.Fatalf("expected cache root to end in covers, got %q", root)
	}
	if filepath.Base(filepath.Dir(root)) != "autoreas-bridge" {
		t.Fatalf("expected cache root's parent to be autoreas-bridge, got %q", root)
	}
}
