package cover_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

// TestDiskCachePutConcurrentWritersUseUniqueTemps races real goroutines Putting distinct payloads under one key; a shared temp name could interleave two writes into a corrupted file, unique names make that structurally impossible.
func TestDiskCachePutConcurrentWritersUseUniqueTemps(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	c := cover.NewDiskCache(root)
	const key = "https://cdn.example.com/race.jpg"

	const writers = 8
	payloads := make([][]byte, writers)
	for i := range payloads {
		payloads[i] = []byte(strings.Repeat(fmt.Sprintf("writer-%d;", i), 512))
	}

	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(data []byte) {
			defer wg.Done()
			errs <- c.Put(key, data)
		}(payloads[i])
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent Put: %v", err)
		}
	}

	got, ok := c.Get(key)
	if !ok {
		t.Fatal("expected a hit after concurrent writers")
	}
	matched := false
	for _, payload := range payloads {
		if string(got) == string(payload) {
			matched = true
			break
		}
	}
	if !matched {
		t.Fatalf("final bytes matched no writer's exact payload (corrupted): %d bytes", len(got))
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read cache root: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected exactly one published entry and no leftover temp files, got %d", len(entries))
	}
}

// TestDiskCachePutTreatsExistingFinalAsPublished forces the measured Windows rename failure (an os.Open reader holds the destination) and asserts Put still reports success with the published bytes intact.
func TestDiskCachePutTreatsExistingFinalAsPublished(t *testing.T) {
	root := t.TempDir()
	c := cover.NewDiskCache(root)
	const key = "https://cdn.example.com/published.jpg"

	if err := c.Put(key, []byte("original-bytes")); err != nil {
		t.Fatalf("initial Put: %v", err)
	}

	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 {
		t.Fatalf("expected exactly one published entry before the race, got %v (err=%v)", entries, err)
	}
	finalPath := filepath.Join(root, entries[0].Name())

	reader, err := os.Open(finalPath)
	if err != nil {
		t.Fatalf("open published entry: %v", err)
	}

	putErr := c.Put(key, []byte("new-bytes"))
	closeErr := reader.Close()
	if putErr != nil {
		t.Fatalf("Put while destination held open: %v", putErr)
	}
	if closeErr != nil {
		t.Fatalf("close held-open reader: %v", closeErr)
	}

	remaining, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read cache root: %v", err)
	}
	if len(remaining) != 1 {
		t.Fatalf("expected no leftover temp file after a tolerated rename failure, got %d entries", len(remaining))
	}

	got, ok := c.Get(key)
	if !ok || string(got) != "original-bytes" {
		t.Fatalf("Get() = %q, %v; want the already-published bytes preserved intact", got, ok)
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
