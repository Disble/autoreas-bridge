package anime

import (
	"bytes"
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
