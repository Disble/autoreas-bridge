package anime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
	sharedlogger "autoreas-bridge/internal/logger"
	"github.com/fsnotify/fsnotify"
)

func TestRuntimeWatcherIgnoresUnrelatedFilesInParentDirectory(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parser := &stubSnapshotParser{
		records: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`),
		},
	}
	store := &stubSnapshotStore{
		existing: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`),
		},
	}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       filepath.Join("data", "animes.dat"),
		Parser:         parser,
		Store:          store,
		Publisher:      publisher,
		Logger:         logger,
		SharedLogger:   shared,
		DebounceWindow: 50 * time.Millisecond,
		RetryDelay:     10 * time.Millisecond,
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(newStaticReader("ignored")), nil
		},
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)

	backend.emit(fsnotify.Event{Name: filepath.Join("data", "other.dat"), Op: fsnotify.Write})
	timer.fire()

	eventually(t, func() bool {
		return parser.calls() == 0
	})

	if got := len(publisher.events()); got != 0 {
		t.Fatalf("expected no published events for unrelated file, got %d", got)
	}

	cancel()
	watcher.Wait()
}

func TestRuntimeWatcherCoalescesBurstEventsIntoSingleProcessingCycle(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parser := &stubSnapshotParser{
		records: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`),
		},
	}
	store := &stubSnapshotStore{
		existing: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`),
		},
	}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       filepath.Join("data", "animes.dat"),
		Parser:         parser,
		Store:          store,
		Publisher:      publisher,
		Logger:         logger,
		SharedLogger:   shared,
		DebounceWindow: 50 * time.Millisecond,
		RetryDelay:     10 * time.Millisecond,
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(newStaticReader("ignored")), nil
		},
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)

	backend.emit(fsnotify.Event{Name: filepath.Join("data", "animes.dat"), Op: fsnotify.Write})
	backend.emit(fsnotify.Event{Name: filepath.Join("data", "animes.dat"), Op: fsnotify.Write})
	backend.emit(fsnotify.Event{Name: filepath.Join("data", "animes.dat"), Op: fsnotify.Create})
	timer.fire()

	eventually(t, func() bool {
		return parser.calls() == 1
	})

	if got := parser.calls(); got != 1 {
		t.Fatalf("expected one parse cycle after burst, got %d", got)
	}

	if got := store.replaceCalls(); got != 1 {
		t.Fatalf("expected one baseline replace after burst, got %d", got)
	}

	if got := len(publisher.events()); got != 1 {
		t.Fatalf("expected one published delta after burst, got %d", got)
	}

	assertPublishedAnimeChanged(t, publisher.events()[0], "keep", `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)

	entries := shared.entries()
	foundPublishedInfo := false
	for _, entry := range entries {
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelInfo {
			foundPublishedInfo = true
		}
	}
	if !foundPublishedInfo {
		t.Fatalf("expected anime info log for published deltas, got %#v", entries)
	}

	cancel()
	watcher.Wait()
}

func TestRuntimeWatcherRecreatesBackendAfterWatcherError(t *testing.T) {
	t.Parallel()

	firstBackend := newStubFileWatcher()
	secondBackend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parser := &stubSnapshotParser{
		records: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`),
		},
	}
	store := &stubSnapshotStore{
		existing: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`),
		},
	}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	backends := []FileWatcher{firstBackend, secondBackend}
	factoryCalls := 0
	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       filepath.Join("data", "animes.dat"),
		Parser:         parser,
		Store:          store,
		Publisher:      publisher,
		Logger:         logger,
		SharedLogger:   shared,
		DebounceWindow: 50 * time.Millisecond,
		RetryDelay:     10 * time.Millisecond,
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(newStaticReader("ignored")), nil
		},
		WatcherFactory: func() (FileWatcher, error) {
			backend := backends[factoryCalls]
			factoryCalls++
			return backend, nil
		},
		TimerFactory: func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	firstBackend.waitUntilAdded(t)
	firstBackend.errors <- errors.New("backend exploded")
	secondBackend.waitUntilAdded(t)
	secondBackend.emit(fsnotify.Event{Name: filepath.Join("data", "animes.dat"), Op: fsnotify.Create})
	timer.fire()

	eventually(t, func() bool {
		return parser.calls() == 1
	})

	if got := factoryCalls; got != 2 {
		t.Fatalf("expected watcher factory to be called twice, got %d", got)
	}

	if got := len(publisher.events()); got != 1 {
		t.Fatalf("expected recovery backend to publish one delta, got %d", got)
	}

	if err := watcher.Err(); err != nil {
		t.Fatalf("expected watcher to recover without terminal error, got %v", err)
	}

	entries := shared.entries()
	foundRetryWarn := false
	for _, entry := range entries {
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelWarn {
			foundRetryWarn = true
		}
	}
	if !foundRetryWarn {
		t.Fatalf("expected anime warning log for backend failure, got %#v", entries)
	}

	cancel()
	watcher.Wait()
}

type stubFileWatcher struct {
	added   chan string
	events  chan fsnotify.Event
	errors  chan error
	closeMu sync.Mutex
	closed  bool
}

func newStubFileWatcher() *stubFileWatcher {
	return &stubFileWatcher{
		added:  make(chan string, 1),
		events: make(chan fsnotify.Event, 8),
		errors: make(chan error, 1),
	}
}

func (s *stubFileWatcher) Add(name string) error {
	s.added <- name
	return nil
}

func (s *stubFileWatcher) Events() <-chan fsnotify.Event { return s.events }
func (s *stubFileWatcher) Errors() <-chan error          { return s.errors }

func (s *stubFileWatcher) Close() error {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	close(s.events)
	close(s.errors)
	return nil
}

func (s *stubFileWatcher) emit(event fsnotify.Event) {
	s.events <- event
}

func (s *stubFileWatcher) waitUntilAdded(t *testing.T) string {
	t.Helper()
	select {
	case added := <-s.added:
		return added
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected watcher to add parent directory")
		return ""
	}
}

type stubDebounceTimer struct {
	ch chan time.Time
}

func newStubDebounceTimer() *stubDebounceTimer {
	return &stubDebounceTimer{ch: make(chan time.Time, 8)}
}

func (s *stubDebounceTimer) C() <-chan time.Time { return s.ch }
func (s *stubDebounceTimer) Reset(time.Duration) {}
func (s *stubDebounceTimer) Stop() bool          { return true }
func (s *stubDebounceTimer) fire()               { s.ch <- time.Now() }

func snapshotRecordFromPayload(t *testing.T, payload string) SnapshotRecord {
	t.Helper()

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}

	canonical, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal canonical payload: %v", err)
	}

	return SnapshotRecord{
		AnimeID:       raw.ID,
		CanonicalJSON: canonical,
		Hash:          HashSnapshot(canonical),
	}
}

func newStaticReader(contents string) io.Reader {
	return bytes.NewBufferString(contents)
}

func eventually(t *testing.T, condition func() bool) {
	eventuallyWithin(t, 200*time.Millisecond, condition)
}

func eventuallyWithin(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !condition() {
		t.Fatal("condition not satisfied before timeout")
	}
}
