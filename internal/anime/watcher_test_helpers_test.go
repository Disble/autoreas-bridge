package anime

import (
	"bytes"
	"context"
	"io"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/legacy"
	"github.com/fsnotify/fsnotify"
)

type stubFileWatcher struct {
	added   chan string
	events  chan fsnotify.Event
	errors  chan error
	closeMu sync.Mutex
	closed  bool
}

// newStubFileWatcher creates a controllable filesystem watcher double.
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

// emit sends an event through the watcher double.
func (s *stubFileWatcher) emit(event fsnotify.Event) {
	s.events <- event
}

// waitUntilAdded waits for the watcher to register its directory.
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

// newStubDebounceTimer creates a controllable debounce timer double.
func newStubDebounceTimer() *stubDebounceTimer {
	return &stubDebounceTimer{ch: make(chan time.Time, 8)}
}

func (s *stubDebounceTimer) C() <-chan time.Time { return s.ch }
func (s *stubDebounceTimer) Reset(time.Duration) {}
func (s *stubDebounceTimer) Stop() bool          { return true }

// fire triggers the timer double.
func (s *stubDebounceTimer) fire() { s.ch <- time.Now() }

// stubBridgeNativeRegistry is the shared SDD-48 test double for
// BridgeNativeRegistry, reused across watcher/pipeline/service tests in this
// package (no-duplication skill: one helper, many call sites).
type stubBridgeNativeRegistry struct {
	mu            sync.Mutex
	owned         map[string]struct{}
	listCalls     int
	listErr       error
	registerCalls []string
	registerErr   error
}

func (s *stubBridgeNativeRegistry) ListOwnedIDs(context.Context) (map[string]struct{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listCalls++
	if s.listErr != nil {
		return nil, s.listErr
	}
	out := make(map[string]struct{}, len(s.owned))
	for id := range s.owned {
		out[id] = struct{}{}
	}
	return out, nil
}

func (s *stubBridgeNativeRegistry) RegisterOwned(_ context.Context, animeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.registerErr != nil {
		return s.registerErr
	}
	s.registerCalls = append(s.registerCalls, animeID)
	if s.owned == nil {
		s.owned = make(map[string]struct{})
	}
	s.owned[animeID] = struct{}{}
	return nil
}

// listCallCount returns ownership-list calls made to the registry double.
func (s *stubBridgeNativeRegistry) listCallCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listCalls
}

// registeredIDs returns ownership registrations made to the registry double.
func (s *stubBridgeNativeRegistry) registeredIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.registerCalls...)
}

// snapshotRecordFromPayload builds a snapshot record from fixture JSON.
func snapshotRecordFromPayload(t *testing.T, payload string) SnapshotRecord {
	t.Helper()

	value, canonical, err := legacy.Decode([]byte(payload))
	if err != nil {
		t.Fatalf("decode canonical payload: %v", err)
	}

	return SnapshotRecord{AnimeID: value.ID, CanonicalJSON: canonical, Hash: HashSnapshot(canonical)}
}

// newStaticReader returns a reader over static test contents.
func newStaticReader(contents string) io.Reader {
	return bytes.NewBufferString(contents)
}

// eventually waits briefly for a test condition to become true.
func eventually(t *testing.T, condition func() bool) {
	eventuallyWithin(t, 200*time.Millisecond, condition)
}

// eventuallyWithin waits up to a timeout for a test condition.
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
