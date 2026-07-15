package main

import (
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRunWithArchitectureFSRejectsViolationInsideDirectorySymlink(t *testing.T) {
	root := filepath.Clean("repo")
	target := filepath.Clean("outside/legacy-copy")
	fake := fakeArchitectureFS{
		directories: map[string][]fs.DirEntry{
			root: {fakeDirEntry{name: "linked", mode: fs.ModeSymlink}},
			target: {
				fakeDirEntry{name: "leak.go"},
				fakeDirEntry{name: "loop", mode: fs.ModeSymlink},
			},
		},
		targets: map[string]string{
			filepath.Join(root, "linked"): target,
			filepath.Join(target, "loop"): target,
		},
		directoryTargets: map[string]bool{
			filepath.Join(root, "linked"): true,
			filepath.Join(target, "loop"): true,
		},
		files: map[string][]byte{
			filepath.Join(target, "leak.go"): []byte("package copied\nimport boundary \"autoreas-bridge/internal/anime/legacy\"\nvar _ boundary.LegacyAnimeRaw\n"),
		},
	}

	err := runWithArchitectureFS(root, fake)
	if err == nil {
		t.Fatal("runWithArchitectureFS error = nil, want directory-symlink violation")
	}
	if got := err.Error(); !strings.Contains(got, "linked/leak.go") || !strings.Contains(got, "LegacyAnimeRaw") {
		t.Fatalf("runWithArchitectureFS error = %q, want logical symlink path and DTO violation", got)
	}
}

type fakeArchitectureFS struct {
	directories      map[string][]fs.DirEntry
	targets          map[string]string
	directoryTargets map[string]bool
	files            map[string][]byte
}

func (f fakeArchitectureFS) ReadDir(path string) ([]fs.DirEntry, error) {
	return f.directories[filepath.Clean(path)], nil
}

func (f fakeArchitectureFS) ReadFile(path string) ([]byte, error) {
	return f.files[filepath.Clean(path)], nil
}

func (f fakeArchitectureFS) Stat(path string) (fs.FileInfo, error) {
	clean := filepath.Clean(path)
	return fakeFileInfo{name: filepath.Base(clean), directory: f.directoryTargets[clean]}, nil
}

func (f fakeArchitectureFS) EvalSymlinks(path string) (string, error) {
	clean := filepath.Clean(path)
	if target, ok := f.targets[clean]; ok {
		return target, nil
	}
	return clean, nil
}

type fakeDirEntry struct {
	name string
	mode fs.FileMode
}

func (e fakeDirEntry) Name() string      { return e.name }
func (e fakeDirEntry) IsDir() bool       { return e.mode.IsDir() }
func (e fakeDirEntry) Type() fs.FileMode { return e.mode }
func (e fakeDirEntry) Info() (fs.FileInfo, error) {
	return fakeFileInfo{name: e.name, directory: e.IsDir()}, nil
}

type fakeFileInfo struct {
	name      string
	directory bool
}

func (i fakeFileInfo) Name() string       { return i.name }
func (i fakeFileInfo) Size() int64        { return 0 }
func (i fakeFileInfo) Mode() fs.FileMode  { return 0 }
func (i fakeFileInfo) ModTime() time.Time { return time.Time{} }
func (i fakeFileInfo) IsDir() bool        { return i.directory }
func (i fakeFileInfo) Sys() any           { return nil }
