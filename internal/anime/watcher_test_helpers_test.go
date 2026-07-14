package anime

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"github.com/fsnotify/fsnotify"
)

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

func (s *stubBridgeNativeRegistry) listCallCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listCalls
}

func (s *stubBridgeNativeRegistry) registeredIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.registerCalls...)
}

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

	return SnapshotRecord{AnimeID: raw.ID, CanonicalJSON: canonical, Hash: HashSnapshot(canonical)}
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
