package anime

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestStartupCoordinatorStartsAsyncAndWaitsForGhostFile(t *testing.T) {
	t.Parallel()

	parser := &stubSnapshotParser{}
	store := &stubSnapshotStore{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	tickCh := make(chan time.Time, 2)
	started := make(chan struct{}, 1)

	coordinator := NewStartupCoordinator(StartupCoordinatorConfig{
		FilePath:     "ghost/animes.dat",
		Parser:       parser,
		Store:        store,
		Publisher:    &recordingPublisher{},
		Logger:       logger,
		SharedLogger: shared,
		PollInterval: 5 * time.Second,
		FileExists:   func(string) bool { return false },
		OpenFile: func(string) (io.ReadCloser, error) {
			t.Fatal("open should not be called while file is missing")
			return nil, nil
		},
		TickerFactory: func(time.Duration) Ticker { started <- struct{}{}; return &stubTicker{ch: tickCh} },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	coordinator.StartAsync(ctx)

	select {
	case <-started:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected coordinator to start in background without blocking")
	}

	if parser.calls() != 0 {
		t.Fatal("expected parser not to run while file is missing")
	}

	if store.listCalls() != 0 {
		t.Fatal("expected store not to be queried while file is missing")
	}

	if len(logger.messages()) == 0 {
		t.Fatal("expected waiting logger message for missing file")
	}

	entries := shared.entries()
	if len(entries) == 0 || entries[0].Domain != "system" || entries[0].Level != sharedlogger.LevelWarn {
		t.Fatalf("expected system warning entry for missing file, got %#v", entries)
	}

	cancel()
	coordinator.Wait()
	if err := coordinator.Err(); err != nil {
		t.Fatalf("expected graceful cancellation, got %v", err)
	}
	_ = tickCh
}

func TestStartupCoordinatorProcessesAppearingFileDiffsAndPrunesDeletes(t *testing.T) {
	t.Parallel()

	current := map[string]SnapshotRecord{
		"keep": {AnimeID: "keep", CanonicalJSON: []byte(`{"_id":"keep","nombre":"Updated","nrocapvisto":2}`), Hash: HashSnapshot([]byte(`{"_id":"keep","nombre":"Updated","nrocapvisto":2}`))},
		"new":  {AnimeID: "new", CanonicalJSON: []byte(`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`), Hash: HashSnapshot([]byte(`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`))},
	}
	previous := map[string]SnapshotRecord{
		"keep": {AnimeID: "keep", CanonicalJSON: []byte(`{"_id":"keep","nombre":"Old","nrocapvisto":1}`), Hash: HashSnapshot([]byte(`{"_id":"keep","nombre":"Old","nrocapvisto":1}`))},
		"gone": {AnimeID: "gone", CanonicalJSON: []byte(`{"_id":"gone","nombre":"Removed","nrocapvisto":1}`), Hash: HashSnapshot([]byte(`{"_id":"gone","nombre":"Removed","nrocapvisto":1}`))},
	}

	parser := &stubSnapshotParser{records: current, warnings: []ParseWarning{{Line: 7, Reason: "corrupt json"}}}
	store := &stubSnapshotStore{existing: previous}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	shared := &recordingSharedLogger{}
	tickCh := make(chan time.Time, 1)
	fileExists := false

	coordinator := NewStartupCoordinator(StartupCoordinatorConfig{
		FilePath:     "data/animes.dat",
		Parser:       parser,
		Store:        store,
		Publisher:    publisher,
		Logger:       logger,
		SharedLogger: shared,
		PollInterval: 5 * time.Second,
		FileExists: func(string) bool {
			return fileExists
		},
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
		TickerFactory: func(time.Duration) Ticker { return &stubTicker{ch: tickCh} },
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	coordinator.StartAsync(ctx)

	fileExists = true
	tickCh <- time.Now()
	coordinator.Wait()

	if err := coordinator.Err(); err != nil {
		t.Fatalf("expected successful catch-up, got %v", err)
	}

	if parser.calls() != 1 {
		t.Fatalf("expected parser to run once, got %d", parser.calls())
	}

	if store.listCalls() != 1 {
		t.Fatalf("expected store list to run once, got %d", store.listCalls())
	}

	if store.replaceCalls() != 1 {
		t.Fatalf("expected store replace to run once, got %d", store.replaceCalls())
	}

	pruneIDs := store.lastPruneIDs()
	if len(pruneIDs) != 1 || pruneIDs[0] != "gone" {
		t.Fatalf("expected prune ids [gone], got %v", pruneIDs)
	}

	published := publisher.events()
	if len(published) != 3 {
		t.Fatalf("expected 3 retroactive events, got %d", len(published))
	}

	assertPublishedAnimeChanged(t, published[0], "keep", `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)
	assertPublishedAnimeChanged(t, published[1], "new", `{"_id":"new","nombre":"Brand New","nrocapvisto":3}`)
	assertPublishedDelete(t, published[2], "gone")

	if len(logger.messages()) == 0 {
		t.Fatal("expected parser warnings to be logged")
	}

	entries := shared.entries()
	if len(entries) == 0 {
		t.Fatal("expected structured log entries to be recorded")
	}

	foundCatchupInfo := false
	foundParseWarn := false
	for _, entry := range entries {
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelInfo && strings.Contains(entry.Message, "catch-up") {
			foundCatchupInfo = true
		}
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelWarn && strings.Contains(entry.Message, "warning parsing") {
			foundParseWarn = true
		}
	}

	if !foundCatchupInfo {
		t.Fatalf("expected catch-up info log, got %#v", entries)
	}
	if !foundParseWarn {
		t.Fatalf("expected parse warning log, got %#v", entries)
	}
}

func TestStartupCoordinatorRespectsCancellationWhileWaiting(t *testing.T) {
	t.Parallel()

	coordinator := NewStartupCoordinator(StartupCoordinatorConfig{
		FilePath:      "ghost/animes.dat",
		Parser:        &stubSnapshotParser{},
		Store:         &stubSnapshotStore{},
		Publisher:     &recordingPublisher{},
		Logger:        &recordingWarningLogger{},
		SharedLogger:  &recordingSharedLogger{},
		PollInterval:  5 * time.Second,
		FileExists:    func(string) bool { return false },
		OpenFile:      func(string) (io.ReadCloser, error) { return nil, errors.New("should not open") },
		TickerFactory: func(time.Duration) Ticker { return &stubTicker{ch: make(chan time.Time)} },
	})

	ctx, cancel := context.WithCancel(context.Background())
	coordinator.StartAsync(ctx)
	cancel()
	coordinator.Wait()

	if err := coordinator.Err(); err != nil {
		t.Fatalf("expected nil error after cancellation, got %v", err)
	}
	if !errors.Is(coordinator.ContextErr(), context.Canceled) {
		t.Fatalf("expected context canceled, got %v", coordinator.ContextErr())
	}
}

type stubSnapshotParser struct {
	mu       sync.Mutex
	count    int
	records  map[string]SnapshotRecord
	warnings []ParseWarning
	err      error
}

func (s *stubSnapshotParser) Parse(io.Reader) (map[string]SnapshotRecord, []ParseWarning, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.count++
	return cloneSnapshotRecords(s.records), append([]ParseWarning(nil), s.warnings...), s.err
}

func (s *stubSnapshotParser) calls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.count
}

type stubSnapshotStore struct {
	mu           sync.Mutex
	existing     map[string]SnapshotRecord
	listCount    int
	replaceCount int
	lastCurrent  map[string]SnapshotRecord
	prune        []string
	err          error
}

func (s *stubSnapshotStore) ListSnapshots(context.Context) (map[string]SnapshotRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listCount++
	return cloneSnapshotRecords(s.existing), s.err
}

func (s *stubSnapshotStore) ReplaceBaseline(_ context.Context, current map[string]SnapshotRecord, pruneIDs []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.replaceCount++
	s.lastCurrent = cloneSnapshotRecords(current)
	s.prune = append([]string(nil), pruneIDs...)
	return s.err
}

func (s *stubSnapshotStore) listCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listCount
}

func (s *stubSnapshotStore) replaceCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.replaceCount
}

func (s *stubSnapshotStore) lastPruneIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.prune...)
}

type recordingPublisher struct {
	mu         sync.Mutex
	eventsList []events.Event
}

func (p *recordingPublisher) Publish(event events.Event) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.eventsList = append(p.eventsList, event)
}

func (p *recordingPublisher) events() []events.Event {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]events.Event, len(p.eventsList))
	copy(out, p.eventsList)
	return out
}

type recordingWarningLogger struct {
	mu   sync.Mutex
	msgs []string
}

func (l *recordingWarningLogger) Warnf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.msgs = append(l.msgs, fmt.Sprintf(format, args...))
}

func (l *recordingWarningLogger) messages() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, len(l.msgs))
	copy(out, l.msgs)
	return out
}

type recordingSharedLogger struct {
	mu  sync.Mutex
	log []sharedlogger.LogEntry
}

func (l *recordingSharedLogger) Infof(domain, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log = append(l.log, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingSharedLogger) Warnf(domain, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log = append(l.log, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingSharedLogger) Errorf(domain, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log = append(l.log, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError, Message: fmt.Sprintf(format, args...)})
}

func (l *recordingSharedLogger) entries() []sharedlogger.LogEntry {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]sharedlogger.LogEntry, len(l.log))
	copy(out, l.log)
	return out
}

type stubTicker struct {
	ch <-chan time.Time
}

func (t *stubTicker) C() <-chan time.Time { return t.ch }
func (t *stubTicker) Stop()               {}

func assertPublishedAnimeChanged(t *testing.T, event events.Event, wantID string, wantPayload string) {
	t.Helper()

	changed, ok := event.(events.AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", event)
	}

	if changed.AnimeID != wantID {
		t.Fatalf("expected anime id %q, got %q", wantID, changed.AnimeID)
	}

	if string(changed.Payload) != wantPayload {
		t.Fatalf("expected payload %s, got %s", wantPayload, string(changed.Payload))
	}
}

func assertPublishedDelete(t *testing.T, event events.Event, wantID string) {
	t.Helper()

	changed, ok := event.(events.AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", event)
	}

	if changed.AnimeID != wantID {
		t.Fatalf("expected anime id %q, got %q", wantID, changed.AnimeID)
	}

	if changed.Payload != nil {
		t.Fatalf("expected nil payload delete event, got %s", string(changed.Payload))
	}
}
