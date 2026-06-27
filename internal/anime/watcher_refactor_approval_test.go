package anime

import (
	"path/filepath"
	"testing"
)

func TestRuntimeWatcherAddsParentDirectoryInsteadOfFilePath(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       filepath.Join("data", "animes.dat"),
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return newStubDebounceTimer() },
	})

	runtimeWatcher, ok := watcher.(*runtimeWatcher)
	if !ok {
		t.Fatalf("expected concrete runtimeWatcher, got %T", watcher)
	}

	if runtimeWatcher.watchDir != filepath.Join("data") {
		t.Fatalf("expected watchDir %q, got %q", filepath.Join("data"), runtimeWatcher.watchDir)
	}
	if runtimeWatcher.watchBase != "animes.dat" {
		t.Fatalf("expected watchBase %q, got %q", "animes.dat", runtimeWatcher.watchBase)
	}
}
