package anime

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestStartupCoordinatorProcessesAppearingFileDiffsAndPrunesDeletes(t *testing.T) {
	t.Parallel()
	env := newCatchUpDiffEnv()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	env.coordinator.StartAsync(ctx)
	env.fileExists = true
	env.tickCh <- time.Now()
	env.coordinator.Wait()

	assertCatchUpDiffRun(t, env)
	assertCatchUpDiffEvents(t, env.publisher.events())
	assertCatchUpDiffLogs(t, env.logger, env.shared)
}

type catchUpDiffEnv struct {
	coordinator StartupCoordinator
	parser      *stubSnapshotParser
	store       *stubSnapshotStore
	publisher   *recordingPublisher
	logger      *recordingWarningLogger
	shared      *recordingSharedLogger
	tickCh      chan time.Time
	fileExists  bool
}

// newCatchUpDiffEnv builds the startup diff test environment.
func newCatchUpDiffEnv() *catchUpDiffEnv {
	env := &catchUpDiffEnv{
		parser: &stubSnapshotParser{records: map[string]SnapshotRecord{
			"keep": {AnimeID: "keep", CanonicalJSON: []byte(`{"_id":"keep","nombre":"Updated","nrocapvisto":2}`), Hash: HashSnapshot([]byte(`{"_id":"keep","nombre":"Updated","nrocapvisto":2}`))},
			"new":  {AnimeID: "new", CanonicalJSON: []byte(`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`), Hash: HashSnapshot([]byte(`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`))},
		}, warnings: []ParseWarning{{Line: 7, Reason: "corrupt json"}}},
		store: &stubSnapshotStore{existing: map[string]SnapshotRecord{
			"keep": {AnimeID: "keep", CanonicalJSON: []byte(`{"_id":"keep","nombre":"Old","nrocapvisto":1}`), Hash: HashSnapshot([]byte(`{"_id":"keep","nombre":"Old","nrocapvisto":1}`))},
			"gone": {AnimeID: "gone", CanonicalJSON: []byte(`{"_id":"gone","nombre":"Removed","nrocapvisto":1}`), Hash: HashSnapshot([]byte(`{"_id":"gone","nombre":"Removed","nrocapvisto":1}`))},
		}},
		publisher: &recordingPublisher{},
		logger:    &recordingWarningLogger{},
		shared:    &recordingSharedLogger{},
		tickCh:    make(chan time.Time, 1),
	}
	env.coordinator = NewStartupCoordinator(StartupCoordinatorConfig{
		FilePath:     "data/animes.dat",
		Parser:       env.parser,
		Store:        env.store,
		Publisher:    env.publisher,
		Logger:       env.logger,
		SharedLogger: env.shared,
		PollInterval: 5 * time.Second,
		FileExists: func(string) bool {
			return env.fileExists
		},
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
		TickerFactory: func(time.Duration) Ticker { return &stubTicker{ch: env.tickCh} },
	})
	return env
}

// assertCatchUpDiffRun verifies the startup diff run outcome.
func assertCatchUpDiffRun(t *testing.T, env *catchUpDiffEnv) {
	t.Helper()
	if err := env.coordinator.Err(); err != nil {
		t.Fatalf("expected successful catch-up, got %v", err)
	}
	if env.parser.calls() != 1 || env.store.listCalls() != 1 || env.store.replaceCalls() != 1 {
		t.Fatalf("expected one parser/list/replace run, got parser=%d list=%d replace=%d", env.parser.calls(), env.store.listCalls(), env.store.replaceCalls())
	}
	if pruneIDs := env.store.lastPruneIDs(); len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids (soft-delete only), got %v", pruneIDs)
	}
}

// assertCatchUpDiffEvents verifies events emitted by startup catch-up.
func assertCatchUpDiffEvents(t *testing.T, published []events.Event) {
	t.Helper()
	if len(published) != 3 {
		t.Fatalf("expected 3 retroactive events, got %d", len(published))
	}
	assertPublishedAnimeChanged(t, published[0], "keep", `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)
	assertPublishedAnimeChanged(t, published[1], "new", `{"_id":"new","nombre":"Brand New","nrocapvisto":3}`)
	assertPublishedSoftDelete(t, published[2], "gone", "Removed")
}

// assertCatchUpDiffLogs verifies startup catch-up logging.
func assertCatchUpDiffLogs(t *testing.T, logger *recordingWarningLogger, shared *recordingSharedLogger) {
	t.Helper()
	if len(logger.messages()) == 0 {
		t.Fatal("expected parser warnings to be logged")
	}
	entries := shared.entries()
	if len(entries) == 0 {
		t.Fatal("expected structured log entries to be recorded")
	}
	catchupEntry, foundCatchupInfo, foundParseWarn := findCatchUpLogEvidence(entries)
	if !foundCatchupInfo {
		t.Fatalf("expected catch-up info log, got %#v", entries)
	}
	if !foundParseWarn {
		t.Fatalf("expected parse warning log, got %#v", entries)
	}
	if catchupEntry.EventType != "anime.catchup" || catchupEntry.DurationMs < 0 {
		t.Fatalf("unexpected catch-up log entry: %#v", catchupEntry)
	}
}

// findCatchUpLogEvidence locates expected catch-up log entries.
func findCatchUpLogEvidence(entries []sharedlogger.LogEntry) (sharedlogger.LogEntry, bool, bool) {
	var catchupEntry sharedlogger.LogEntry
	foundCatchupInfo := false
	foundParseWarn := false
	for _, entry := range entries {
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelInfo && strings.Contains(entry.Message, "catch-up") {
			foundCatchupInfo = true
			catchupEntry = entry
		}
		if entry.Domain == "anime" && entry.Level == sharedlogger.LevelWarn && strings.Contains(entry.Message, "warning parsing") {
			foundParseWarn = true
		}
	}
	return catchupEntry, foundCatchupInfo, foundParseWarn
}
