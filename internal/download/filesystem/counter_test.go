package filesystem

import (
	"os"
	"path/filepath"
	"testing"
)

// writeFile creates a test file and its parent directories.
func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// --- CountAtRoot (non-recursive) ---

func TestCountAtRootCountsOnlyVideoFilesDirectlyInFolder(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "ep01.mp4"))
	writeFile(t, filepath.Join(root, "ep02.mkv"))
	writeFile(t, filepath.Join(root, "readme.txt"))        // non-video, ignored
	writeFile(t, filepath.Join(root, "Pack1", "ep03.mp4")) // subfolder, ignored by CountAtRoot

	counter := NewEpisodeCounter()
	got := counter.CountAtRoot(root)
	if got != 2 {
		t.Fatalf("expected CountAtRoot=2, got %d", got)
	}
}

func TestCountAtRootReturnsZeroWhenFolderDoesNotExist(t *testing.T) {
	t.Parallel()

	counter := NewEpisodeCounter()
	got := counter.CountAtRoot(filepath.Join(t.TempDir(), "does-not-exist"))
	if got != 0 {
		t.Fatalf("expected 0 for a missing folder, got %d", got)
	}
}

func TestCountAtRootIsCaseInsensitiveOnExtension(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "EP01.MP4"))

	counter := NewEpisodeCounter()
	got := counter.CountAtRoot(root)
	if got != 1 {
		t.Fatalf("expected CountAtRoot=1 for uppercase extension, got %d", got)
	}
}
