package filesystem

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

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

// --- CountRecursive ---

func TestCountRecursiveCountsVideoFilesInRootAndSubfolders(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "ep01.mp4"))
	writeFile(t, filepath.Join(root, "Pack1", "ep02.mkv"))
	writeFile(t, filepath.Join(root, "Pack1", "ep03.avi"))
	writeFile(t, filepath.Join(root, "Pack1", "readme.txt"))

	counter := NewEpisodeCounter()
	got := counter.CountRecursive(root)
	if got != 3 {
		t.Fatalf("expected CountRecursive=3, got %d", got)
	}
}

func TestCountRecursiveReturnsZeroWhenFolderDoesNotExist(t *testing.T) {
	t.Parallel()

	counter := NewEpisodeCounter()
	got := counter.CountRecursive(filepath.Join(t.TempDir(), "missing"))
	if got != 0 {
		t.Fatalf("expected 0 for a missing folder, got %d", got)
	}
}

func TestCountAtRootAndCountRecursiveDifferWhenFilesAreInASubfolder(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "Pack1", "ep01.mp4"))

	counter := NewEpisodeCounter()
	atRoot := counter.CountAtRoot(root)
	recursive := counter.CountRecursive(root)

	if atRoot != 0 {
		t.Fatalf("expected CountAtRoot=0 (file is in a subfolder), got %d", atRoot)
	}
	if recursive != 1 {
		t.Fatalf("expected CountRecursive=1, got %d", recursive)
	}
}

func TestHighestEpisodeAtRootUsesTrailingEpisodeNumberFromVideoFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "trigunstampedesvs-06.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampadesesq-08.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampadeevs-09.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampadesvqs-10.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampedestems-11", "episode.mp4"))

	counter := NewEpisodeCounter()
	got := counter.HighestEpisodeAtRoot(root)
	if got != 10 {
		t.Fatalf("expected highest root episode 10, got %d", got)
	}
}

func TestHighestEpisodeRecursiveSeesNestedJDFolderVideoNumbers(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "trigunstampadesvqs-10.mp4"))
	writeFile(t, filepath.Join(root, "trigunstampedestems-11", "trigunstampedestems-11.mp4"))

	counter := NewEpisodeCounter()
	got := counter.HighestEpisodeRecursive(root)
	if got != 11 {
		t.Fatalf("expected highest recursive episode 11, got %d", got)
	}
}

// --- Flatten ---

func TestFlattenMovesFilesFromSubfoldersToRootAndRemovesEmptiedDirs(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "Pack1", "ep01.mp4"))
	writeFile(t, filepath.Join(root, "Pack1", "ep02.mkv"))

	flattener := NewFlattener()
	moved, err := flattener.Flatten(context.Background(), root)
	if err != nil {
		t.Fatalf("Flatten: %v", err)
	}
	if moved != 2 {
		t.Fatalf("expected moved=2, got %d", moved)
	}

	if _, err := os.Stat(filepath.Join(root, "ep01.mp4")); err != nil {
		t.Fatalf("expected ep01.mp4 at root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "ep02.mkv")); err != nil {
		t.Fatalf("expected ep02.mkv at root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "Pack1")); !os.IsNotExist(err) {
		t.Fatalf("expected Pack1 subdir to be removed after flatten, stat err: %v", err)
	}
}

func TestFlattenLeavesNonEmptySubfolderInPlaceWhenItStillHasFiles(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	// A non-video file blocks the directory from becoming empty after flatten.
	writeFile(t, filepath.Join(root, "Pack1", "ep01.mp4"))
	writeFile(t, filepath.Join(root, "Pack1", "nested", "deep.mp4"))

	flattener := NewFlattener()
	moved, err := flattener.Flatten(context.Background(), root)
	if err != nil {
		t.Fatalf("Flatten: %v", err)
	}
	// Flatten only moves files directly inside immediate subdirectories of root (PoC
	// flattenDownloadFolder semantics) -- the doubly-nested file is left alone.
	if moved != 1 {
		t.Fatalf("expected moved=1 (only the directly-nested file), got %d", moved)
	}
	if _, err := os.Stat(filepath.Join(root, "ep01.mp4")); err != nil {
		t.Fatalf("expected ep01.mp4 moved to root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "Pack1", "nested", "deep.mp4")); err != nil {
		t.Fatalf("expected deeply nested file to remain untouched: %v", err)
	}
}

func TestFlattenReturnsZeroAndNoErrorWhenFolderDoesNotExist(t *testing.T) {
	t.Parallel()

	flattener := NewFlattener()
	moved, err := flattener.Flatten(context.Background(), filepath.Join(t.TempDir(), "missing"))
	if err != nil {
		t.Fatalf("expected no error for a not-yet-existing folder, got: %v", err)
	}
	if moved != 0 {
		t.Fatalf("expected moved=0, got %d", moved)
	}
}

func TestFlattenReturnsZeroWhenThereAreNoSubfolders(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "ep01.mp4"))

	flattener := NewFlattener()
	moved, err := flattener.Flatten(context.Background(), root)
	if err != nil {
		t.Fatalf("Flatten: %v", err)
	}
	if moved != 0 {
		t.Fatalf("expected moved=0 when there is nothing to flatten, got %d", moved)
	}
}

func TestFlattenSurfacesErrorOnMoveFailureRatherThanSilentlySwallowingIt(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "Pack1", "ep01.mp4"))
	// Create a directory at the destination path so os.Rename for ep01.mp4 fails (you cannot
	// rename a file onto an existing directory) -- this proves Flatten surfaces a real error
	// instead of silently swallowing a failed move (per the orchestrator's mandate: "errors
	// observable, not silently swallowed").
	if err := os.MkdirAll(filepath.Join(root, "ep01.mp4"), 0o755); err != nil {
		t.Fatalf("setup destination collision dir: %v", err)
	}

	flattener := NewFlattener()
	_, err := flattener.Flatten(context.Background(), root)
	if err == nil {
		t.Fatal("expected Flatten to surface an error when a move fails, got nil")
	}
}
