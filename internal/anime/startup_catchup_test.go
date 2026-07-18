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

	assertGhostFileWaiting(t, started, parser, store, logger, shared)

	cancel()
	coordinator.Wait()
	if err := coordinator.Err(); err != nil {
		t.Fatalf("expected graceful cancellation, got %v", err)
	}
	_ = tickCh
}

// assertGhostFileWaiting verifies that startup waits for a missing file.
func assertGhostFileWaiting(t *testing.T, started <-chan struct{}, parser *stubSnapshotParser, store *stubSnapshotStore, logger *recordingWarningLogger, shared *recordingSharedLogger) {
	t.Helper()
	select {
	case <-started:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected coordinator to start in background without blocking")
	}
	if parser.calls() != 0 || store.listCalls() != 0 {
		t.Fatal("expected no parser or store work while file is missing")
	}
	waitFor(t, 200*time.Millisecond, func() bool { return len(logger.messages()) > 0 }, "expected waiting logger message for missing file")
	var entries []sharedlogger.LogEntry
	waitFor(t, 200*time.Millisecond, func() bool { entries = shared.entries(); return len(entries) > 0 }, "expected system warning entry for missing file")
	if entries[0].Domain != "system" || entries[0].Level != sharedlogger.LevelWarn {
		t.Fatalf("expected system warning entry for missing file, got %#v", entries)
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
	mu           sync.Mutex
	count        int
	records      map[string]SnapshotRecord
	warnings     []ParseWarning
	err          error
	beforeReturn func()
}

func (s *stubSnapshotParser) Parse(io.Reader) (map[string]SnapshotRecord, []ParseWarning, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.count++
	if s.beforeReturn != nil {
		s.beforeReturn()
	}
	return cloneSnapshotRecords(s.records), append([]ParseWarning(nil), s.warnings...), s.err
}

// calls returns the number of parser invocations.
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

// listCalls returns the number of baseline reads.
func (s *stubSnapshotStore) listCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listCount
}

// replaceCalls returns the number of baseline replacements.
func (s *stubSnapshotStore) replaceCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.replaceCount
}

// lastPruneIDs returns the IDs pruned by the last replacement.
func (s *stubSnapshotStore) lastPruneIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.prune...)
}

// lastPersistedCurrent returns the last persisted snapshot map.
func (s *stubSnapshotStore) lastPersistedCurrent() map[string]SnapshotRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneSnapshotRecords(s.lastCurrent)
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

// events returns recorded startup events.
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

// messages returns recorded warning messages.
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

func (l *recordingSharedLogger) Debugf(domain, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log = append(l.log, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug, Message: fmt.Sprintf(format, args...)})
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

func (l *recordingSharedLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log = append(l.log, sharedlogger.LogEntry{
		Domain:        domain,
		Level:         level,
		Message:       fmt.Sprintf(format, args...),
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	})
}

// entries returns recorded shared log entries.
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

// assertPublishedAnimeChanged verifies one published anime change.
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

// assertPublishedSoftDelete verifies a catch-up delta for a baseline record
// absent from the latest parse is a soft-delete UPDATE (SDD-30 ADR-30-3b):
// non-nil payload carrying activo=false + fechaEliminacion, never a
// nil-payload physical delete event.
func assertPublishedSoftDelete(t *testing.T, event events.Event, wantID, wantNombre string) {
	t.Helper()

	changed, ok := event.(events.AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", event)
	}

	if changed.AnimeID != wantID {
		t.Fatalf("expected anime id %q, got %q", wantID, changed.AnimeID)
	}

	if len(changed.Payload) == 0 {
		t.Fatal("expected soft-delete payload to be non-nil/non-empty")
	}

	payload := string(changed.Payload)
	for _, want := range []string{`"activo":false`, `"fechaEliminacion"`, `"nombre":"` + wantNombre + `"`} {
		if !strings.Contains(payload, want) {
			t.Fatalf("expected soft-delete payload to contain %q, got %s", want, payload)
		}
	}
}

// waitFor waits until a test condition succeeds or times out.
func waitFor(t *testing.T, timeout time.Duration, condition func() bool, failureMessage string) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	if !condition() {
		t.Fatal(failureMessage)
	}
}
