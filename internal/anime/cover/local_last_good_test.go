package cover_test

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/cover"
)

// countLocalLastGoodFiles reports how many files exist under root's local-last-good subdirectory,
// so a test can assert a load did or did not write to disk through the package's public surface.
func countLocalLastGoodFiles(t *testing.T, root string) int {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(root, "local-last-good"))
	if err != nil {
		if os.IsNotExist(err) {
			return 0
		}
		t.Fatalf("read local-last-good dir: %v", err)
	}
	return len(entries)
}

func TestResolverLoadLocalSavesLastGoodCopyOnSuccess(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	root := t.TempDir()
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: int64(len(jpegBytes)), modTime: time.Unix(1000, 0)}},
	}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(root), 0)

	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := countLocalLastGoodFiles(t, root); got != 2 {
		t.Fatalf("expected a pointer and a content file after a good load, got %d entries", got)
	}
}

func TestResolverLoadLocalSkipsRewriteWhenIdentityUnchanged(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	root := t.TempDir()
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: int64(len(jpegBytes)), modTime: time.Unix(1000, 0)}},
	}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(root), 0)

	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("first Load: %v", err)
	}
	before := countLocalLastGoodFiles(t, root)

	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("second Load: %v", err)
	}
	if after := countLocalLastGoodFiles(t, root); after != before {
		t.Fatalf("expected no disk write on an unchanged identity, had %d entries, now %d", before, after)
	}
}

func TestResolverLoadLocalFallsBackToLastGoodCopyWhenOriginalGone(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	root := t.TempDir()
	modified := time.Unix(1000, 0)
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: int64(len(jpegBytes)), modTime: modified}},
	}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(root), 0)
	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("first Load: %v", err)
	}

	files.statErrors = map[string]error{path: fs.ErrNotExist}

	source, err := resolver.Load(context.Background(), path)
	if err != nil {
		t.Fatalf("Load after deletion: %v", err)
	}
	if string(source.Bytes) != string(jpegBytes) {
		t.Fatalf("fallback bytes = %q, want the last good copy", source.Bytes)
	}
	if source.Identity.LocalPath != path || source.Identity.Size != int64(len(jpegBytes)) || source.Identity.ModTimeUnixNano != modified.UnixNano() {
		t.Fatalf("fallback identity = %#v, want the identity recorded at copy time", source.Identity)
	}
}

func TestResolverLoadLocalMissingWithNoCopyStaysGone(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	files := &fakeFileReader{statErrors: map[string]error{path: fs.ErrNotExist}}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(t.TempDir()), 0)

	_, err := resolver.Load(context.Background(), path)
	if !errors.Is(err, cover.ErrGone) {
		t.Fatalf("Load() error = %v, want ErrGone with no copy on record", err)
	}
}

func TestResolverLoadLocalTransientErrorNeverFallsBack(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	root := t.TempDir()
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: int64(len(jpegBytes)), modTime: time.Unix(1000, 0)}},
	}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(root), 0)
	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("first Load: %v", err)
	}

	files.readErrors = map[string]error{path: errors.New("access denied")}

	_, err := resolver.Load(context.Background(), path)
	if !errors.Is(err, cover.ErrTransient) {
		t.Fatalf("Load() error = %v, want ErrTransient even with a copy on record", err)
	}
}

// TestResolverLoadLocalUpdatesCopyWhenIdentityChanges covers an in-place replacement (design
// behaviour 1's "no rewrite when unchanged" only holds when BOTH size and mtime match): a change
// to either field alone must still update the stored copy, not be mistaken for the same source.
func TestResolverLoadLocalUpdatesCopyWhenIdentityChanges(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		secondSize  int64
		secondMtime time.Time
	}{
		{name: "size and mtime both change", secondSize: int64(len(jpegBytes)) + 1, secondMtime: time.Unix(2000, 0)},
		{name: "size changes, mtime stays", secondSize: int64(len(jpegBytes)) + 1, secondMtime: time.Unix(1000, 0)},
		{name: "mtime changes, size stays", secondSize: int64(len(jpegBytes)), secondMtime: time.Unix(2000, 0)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertResolverLoadLocalUpdatesCopy(t, tc.secondSize, tc.secondMtime)
		})
	}
}

// assertResolverLoadLocalUpdatesCopy loads path once, changes its identity to (secondSize,
// secondMtime), loads again, then deletes it and asserts the fallback serves the second load's
// bytes and identity rather than the first's (the shared body for the identity-change table).
func assertResolverLoadLocalUpdatesCopy(t *testing.T, secondSize int64, secondMtime time.Time) {
	t.Helper()

	const path = `C:\anime\cover.jpg`
	root := t.TempDir()
	newBytes := append(append([]byte{}, jpegBytes...), 0x00)
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: int64(len(jpegBytes)), modTime: time.Unix(1000, 0)}},
	}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(root), 0)
	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("first Load: %v", err)
	}

	files.files[path] = newBytes
	files.infos[path] = fakeFileInfo{size: secondSize, modTime: secondMtime}
	if _, err := resolver.Load(context.Background(), path); err != nil {
		t.Fatalf("Load after identity change: %v", err)
	}

	files.statErrors = map[string]error{path: fs.ErrNotExist}
	source, err := resolver.Load(context.Background(), path)
	if err != nil {
		t.Fatalf("Load after deletion: %v", err)
	}
	if string(source.Bytes) != string(newBytes) {
		t.Fatalf("fallback bytes = %q, want the updated copy, not the stale one", source.Bytes)
	}
	if source.Identity.Size != secondSize || source.Identity.ModTimeUnixNano != secondMtime.UnixNano() {
		t.Fatalf("fallback identity = %#v, want the second load's identity", source.Identity)
	}
}

// TestResolverLoadLocalCopyWriteFailureNeverFailsServe forces os.MkdirAll to fail for the copy
// store by pre-seeding a plain file where its subdirectory must go, then asserts the serve still
// succeeds: a best-effort copy write must never fail or delay the response it rides along with.
func TestResolverLoadLocalCopyWriteFailureNeverFailsServe(t *testing.T) {
	t.Parallel()

	const path = `C:\anime\cover.jpg`
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "local-last-good"), []byte("blocked"), 0o644); err != nil {
		t.Fatalf("seed blocking file: %v", err)
	}
	files := &fakeFileReader{
		files: map[string][]byte{path: jpegBytes},
		infos: map[string]cover.FileInfo{path: fakeFileInfo{size: int64(len(jpegBytes)), modTime: time.Unix(1000, 0)}},
	}
	resolver := cover.NewResolver(files, &fakeFetcher{}, cover.NewDiskCache(root), 0)

	source, err := resolver.Load(context.Background(), path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if string(source.Bytes) != string(jpegBytes) {
		t.Fatalf("Bytes = %q, want the loaded bytes despite the copy-write failure", source.Bytes)
	}
}
