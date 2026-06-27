package anime

import (
	"context"
	"errors"
	"io"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"github.com/fsnotify/fsnotify"
)

func TestRuntimeWatcherIgnoresUnrelatedFilesInParentDirectory(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)}}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`)}}
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
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)

	backend.emit(fsnotify.Event{Name: filepath.Join("data", "other.dat"), Op: fsnotify.Write})
	timer.fire()

	eventually(t, func() bool { return parser.calls() == 0 })
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
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)}}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`)}}
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
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
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

	eventually(t, func() bool { return parser.calls() == 1 })
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

	published := publisher.events()
	changedEvt, ok := published[0].(events.AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", published[0])
	}
	if changedEvt.CorrelationID == "" {
		t.Fatal("expected published event to carry a CorrelationID from watcher cycle")
	}

	entries := shared.entries()
	foundPublishedInfo := false
	var watcherEntry sharedlogger.LogEntry
	for _, entry := range entries {
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelInfo {
			foundPublishedInfo = true
			watcherEntry = entry
		}
	}
	if !foundPublishedInfo {
		t.Fatalf("expected anime info log for published deltas, got %#v", entries)
	}
	if watcherEntry.EventType != "anime.watcher" {
		t.Fatalf("expected watcher log EventType 'anime.watcher', got %q", watcherEntry.EventType)
	}
	if watcherEntry.DurationMs < 0 {
		t.Fatalf("expected watcher log DurationMs >= 0, got %d", watcherEntry.DurationMs)
	}
	if watcherEntry.CorrelationID == "" {
		t.Fatal("expected watcher log to have a CorrelationID")
	}

	cancel()
	watcher.Wait()
}

func TestRuntimeWatcherRecreatesBackendAfterWatcherError(t *testing.T) {
	t.Parallel()

	firstBackend := newStubFileWatcher()
	secondBackend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)}}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`)}}
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
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
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

	eventually(t, func() bool { return parser.calls() == 1 })
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
