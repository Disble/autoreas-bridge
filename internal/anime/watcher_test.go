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
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
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

	// Verify published events carry a CorrelationID from the watcher cycle
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

	// processCurrentFile fails (parser error) inside serveLoop's timer.C()
	// case, which returns (false, err) as terminalErr -- the single
	// terminal-failure seam (watcher.go's serveLoop terminalErr handling in
	// run()), reached exactly once.
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
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(newStaticReader("ignored")), nil
		},
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

	eventually(t, func() bool {
		return parser.calls() == 1
	})

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

	timer.fire()
	watcher.Wait()

	if err := watcher.Err(); err == nil {
		t.Fatal("expected watcher.Err() to still return the terminal error despite the Notify error")
	}
}

// fakeWatcherNotifier is a small per-package fake Notifier (design.md §5: "each
// package may define its own small fake to avoid coupling") recording every
// delivered Notification, with an optional forced error to prove failure
// isolation at the call site.
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
