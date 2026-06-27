package anime

import (
	"context"
	"errors"
	"io"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/notification"
	"github.com/fsnotify/fsnotify"
)

func TestRuntimeWatcherTerminalFailureEmitsExactlyOneErrorNotification(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parseErr := errors.New("parse boom")
	parser := &stubSnapshotParser{err: parseErr}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{}}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	notifier := &fakeWatcherNotifier{}

	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       filepath.Join("data", "animes.dat"),
		Parser:         parser,
		Store:          store,
		Publisher:      publisher,
		Logger:         logger,
		SharedLogger:   shared,
		DebounceWindow: 50 * time.Millisecond,
		RetryDelay:     10 * time.Millisecond,
		Notifier:       notifier,
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)
	timer.fire()
	watcher.Wait()

	if err := watcher.Err(); err == nil {
		t.Fatal("expected watcher.Err() to return the terminal error")
	}

	got := notifier.received()
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 notification delivered, got %d: %#v", len(got), got)
	}
	if got[0].Source != "anime" {
		t.Fatalf("expected Source %q, got %q", "anime", got[0].Source)
	}
	if got[0].Level != notification.LevelError {
		t.Fatalf("expected Level %q, got %q", notification.LevelError, got[0].Level)
	}
	if got[0].CorrelationID != "" {
		t.Fatalf("expected empty CorrelationID, got %q", got[0].CorrelationID)
	}
	if got[0].Timestamp.IsZero() {
		t.Fatal("expected a non-zero Timestamp on the watcher notification")
	}
}

func TestRuntimeWatcherTransientRecoveryEmitsZeroNotifications(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parser := &stubSnapshotParser{records: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)}}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`)}}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	notifier := &fakeWatcherNotifier{}
	secondBackend := newStubFileWatcher()
	backends := []FileWatcher{backend, secondBackend}
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
		Notifier:       notifier,
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		WatcherFactory: func() (FileWatcher, error) {
			b := backends[factoryCalls]
			factoryCalls++
			return b, nil
		},
		TimerFactory: func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)

	backend.errors <- errors.New("transient backend error")
	secondBackend.waitUntilAdded(t)
	secondBackend.emit(fsnotify.Event{Name: filepath.Join("data", "animes.dat"), Op: fsnotify.Create})
	timer.fire()

	eventually(t, func() bool { return parser.calls() == 1 })
	if err := watcher.Err(); err != nil {
		t.Fatalf("expected watcher to recover without terminal error, got %v", err)
	}

	cancel()
	watcher.Wait()
	if got := len(notifier.received()); got != 0 {
		t.Fatalf("expected zero notifications for a self-healing transient failure, got %d", got)
	}
}

func TestRuntimeWatcherNilNotifierIsSafeNoOpAtTerminalFailure(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parseErr := errors.New("parse boom")
	parser := &stubSnapshotParser{err: parseErr}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{}}
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
		Notifier:       nil,
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)
	timer.fire()
	watcher.Wait()

	if err := watcher.Err(); err == nil {
		t.Fatal("expected watcher.Err() to return the terminal error even with a nil Notifier")
	}
}

func TestRuntimeWatcherNotifyErrorDoesNotChangeTerminalOutcome(t *testing.T) {
	t.Parallel()

	backend := newStubFileWatcher()
	timer := newStubDebounceTimer()
	parseErr := errors.New("parse boom")
	parser := &stubSnapshotParser{err: parseErr}
	store := &stubSnapshotStore{existing: map[string]SnapshotRecord{}}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	notifier := &fakeWatcherNotifier{err: errors.New("notify boom")}

	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       filepath.Join("data", "animes.dat"),
		Parser:         parser,
		Store:          store,
		Publisher:      publisher,
		Logger:         logger,
		SharedLogger:   shared,
		DebounceWindow: 50 * time.Millisecond,
		RetryDelay:     10 * time.Millisecond,
		Notifier:       notifier,
		OpenFile:       func(string) (io.ReadCloser, error) { return io.NopCloser(newStaticReader("ignored")), nil },
		WatcherFactory: func() (FileWatcher, error) { return backend, nil },
		TimerFactory:   func() DebounceTimer { return timer },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	backend.waitUntilAdded(t)
	timer.fire()
	watcher.Wait()

	if err := watcher.Err(); err == nil {
		t.Fatal("expected watcher.Err() to still return the terminal error despite the Notify error")
	}
}

type fakeWatcherNotifier struct {
	mu  sync.Mutex
	got []notification.Notification
	err error
}

func (f *fakeWatcherNotifier) Notify(_ context.Context, n notification.Notification) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.got = append(f.got, n)
	return f.err
}

func (f *fakeWatcherNotifier) received() []notification.Notification {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]notification.Notification, len(f.got))
	copy(out, f.got)
	return out
}
