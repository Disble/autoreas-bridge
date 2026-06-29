package anime

import (
	"context"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLegacyPullServiceReturnsZeroUpdatesAfterWatcherAlreadyAdvancedBaseline(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	dataPath := tempDir + string(os.PathSeparator) + "animes.dat"
	updatedPayload := `{"_id":"anime-1","nombre":"Updated","nrocapvisto":2,"totalcap":24}`
	if err := os.WriteFile(dataPath, []byte(updatedPayload+"\n"), 0o600); err != nil {
		t.Fatalf("write anime data fixture: %v", err)
	}

	store := &persistentSnapshotStore{
		records: map[string]SnapshotRecord{
			"anime-1": snapshotRecordFromPayload(t, `{"_id":"anime-1","nombre":"Updated","nrocapvisto":1}`),
		},
	}
	publisher := &recordingPublisher{}
	logger := &recordingWarningLogger{}
	parser := NewSnapshotParser()

	watcher := &runtimeWatcher{
		filePath:   dataPath,
		parser:     parser,
		store:      store,
		publisher:  publisher,
		logger:     logger,
		openFile:   defaultOpenFile,
		retryDelay: 10 * time.Millisecond,
	}
	if err := watcher.processCurrentFile(context.Background()); err != nil {
		t.Fatalf("watcher process current file: %v", err)
	}

	baselineAfterWatcher, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list snapshots after watcher: %v", err)
	}
	assertSnapshotMatchesPayload(t, baselineAfterWatcher["anime-1"], updatedPayload)

	service := NewLegacyPullService(LegacyPullServiceConfig{
		FilePath:  dataPath,
		Parser:    parser,
		Store:     store,
		Publisher: publisher,
		Logger:    logger,
	})

	got := service.Pull(context.Background())

	if got.Status != "ok" {
		t.Fatalf("expected ok status, got %#v", got)
	}
	if got.UpdatedCount != 0 {
		t.Fatalf("expected manual pull to report 0 updates after watcher advanced baseline, got %#v", got)
	}
	if got.Message != "Bridge is already up to date with legacy." {
		t.Fatalf("expected up-to-date message after watcher advanced baseline, got %q", got.Message)
	}
	if got.WarningCount != 0 {
		t.Fatalf("expected clean parse with 0 warnings, got %#v", got)
	}
	if len(logger.messages()) != 0 {
		t.Fatalf("expected no parse/log warnings, got %v", logger.messages())
	}
	if got := len(publisher.events()); got != 1 {
		t.Fatalf("expected watcher to publish the only change before manual pull, got %d events", got)
	}

	baselineAfterManualPull, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list snapshots after manual pull: %v", err)
	}
	assertSnapshotMatchesPayload(t, baselineAfterManualPull["anime-1"], updatedPayload)
	if store.replaceCalls() != 2 {
		t.Fatalf("expected watcher and manual pull to each replace the baseline once, got %d replaces", store.replaceCalls())
	}
}

func TestLegacyPullServicePublishesDeltasAndPersistsBaseline(t *testing.T) {
	t.Parallel()

	current := map[string]SnapshotRecord{
		"anime-a": snapshotRecordFromPayload(t, `{"_id":"anime-a","nombre":"A changed","nrocapvisto":2}`),
		"anime-b": snapshotRecordFromPayload(t, `{"_id":"anime-b","nombre":"B new","nrocapvisto":1}`),
	}
	previous := map[string]SnapshotRecord{
		"anime-a": snapshotRecordFromPayload(t, `{"_id":"anime-a","nombre":"A old","nrocapvisto":1}`),
	}

	parser := &stubSnapshotParser{records: current}
	store := &stubSnapshotStore{existing: previous}
	publisher := &recordingPublisher{}
	service := NewLegacyPullService(LegacyPullServiceConfig{
		FilePath:  "data/animes.dat",
		Parser:    parser,
		Store:     store,
		Publisher: publisher,
		Logger:    &recordingWarningLogger{},
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
	})

	got := service.Pull(context.Background())

	if got.Status != "ok" {
		t.Fatalf("expected ok status, got %#v", got)
	}
	if got.UpdatedCount != 2 {
		t.Fatalf("expected 2 updated records, got %#v", got)
	}
	if got.Message != "Pulled 2 updates from legacy." {
		t.Fatalf("expected delta message, got %q", got.Message)
	}
	if got.PrunedCount != 0 {
		t.Fatalf("expected 0 pruned records, got %#v", got)
	}
	if parser.calls() != 1 || store.listCalls() != 1 || store.replaceCalls() != 1 {
		t.Fatalf("expected one parse/list/replace cycle, parser=%d list=%d replace=%d", parser.calls(), store.listCalls(), store.replaceCalls())
	}

	published := publisher.events()
	if len(published) != 2 {
		t.Fatalf("expected 2 published events, got %d", len(published))
	}
	assertPublishedAnimeChanged(t, published[0], "anime-a", `{"_id":"anime-a","nombre":"A changed","nrocapvisto":2}`)
	assertPublishedAnimeChanged(t, published[1], "anime-b", `{"_id":"anime-b","nombre":"B new","nrocapvisto":1}`)
}

func TestLegacyPullServiceReturnsWarningsWhileSucceeding(t *testing.T) {
	t.Parallel()

	service := NewLegacyPullService(LegacyPullServiceConfig{
		FilePath: "data/animes.dat",
		Parser: &stubSnapshotParser{
			records:  map[string]SnapshotRecord{},
			warnings: []ParseWarning{{Line: 3, Reason: "corrupt json"}},
		},
		Store:     &stubSnapshotStore{},
		Publisher: &recordingPublisher{},
		Logger:    &recordingWarningLogger{},
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
	})

	got := service.Pull(context.Background())

	if got.Status != "ok" {
		t.Fatalf("expected ok status with warnings, got %#v", got)
	}
	if got.WarningCount != 1 {
		t.Fatalf("expected one warning, got %#v", got)
	}
}

func TestBuildLegacyPullMessage(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		updated     int
		pruned      int
		expectedMsg string
	}{
		{name: "up to date", updated: 0, pruned: 0, expectedMsg: "Bridge is already up to date with legacy."},
		{name: "updates only singular", updated: 1, pruned: 0, expectedMsg: "Pulled 1 update from legacy."},
		{name: "updates only plural", updated: 2, pruned: 0, expectedMsg: "Pulled 2 updates from legacy."},
		{name: "removals only", updated: 0, pruned: 1, expectedMsg: "Pulled 1 removal from legacy."},
		{name: "updates and removals", updated: 2, pruned: 1, expectedMsg: "Pulled 2 updates and 1 removal from legacy."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildLegacyPullMessage(tt.updated, tt.pruned); got != tt.expectedMsg {
				t.Fatalf("expected %q, got %q", tt.expectedMsg, got)
			}
		})
	}
}

func TestLegacyPullServiceRejectsConcurrentPullWithoutDuplicateEvents(t *testing.T) {
	t.Parallel()

	parserStarted := make(chan struct{}, 1)
	releaseParser := make(chan struct{})
	parser := &stubSnapshotParser{
		records: map[string]SnapshotRecord{
			"anime-a": snapshotRecordFromPayload(t, `{"_id":"anime-a","nombre":"A changed","nrocapvisto":2}`),
		},
		beforeReturn: func() {
			parserStarted <- struct{}{}
			<-releaseParser
		},
	}
	publisher := &recordingPublisher{}
	service := NewLegacyPullService(LegacyPullServiceConfig{
		FilePath:  "data/animes.dat",
		Parser:    parser,
		Store:     &stubSnapshotStore{},
		Publisher: publisher,
		Logger:    &recordingWarningLogger{},
		OpenFile: func(string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("ignored by stub parser")), nil
		},
	})

	firstDone := make(chan struct{})
	go func() {
		_ = service.Pull(context.Background())
		close(firstDone)
	}()

	select {
	case <-parserStarted:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected first pull to enter parser")
	}

	second := service.Pull(context.Background())
	if second.Status != "in_progress" {
		t.Fatalf("expected in_progress for concurrent pull, got %#v", second)
	}

	close(releaseParser)
	select {
	case <-firstDone:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected first pull to finish")
	}

	if got := len(publisher.events()); got != 1 {
		t.Fatalf("expected only first pull to publish, got %d events", got)
	}
}

type persistentSnapshotStore struct {
	mu           sync.Mutex
	records      map[string]SnapshotRecord
	listCount    int
	replaceCount int
	lastCurrent  map[string]SnapshotRecord
	prune        []string
}

func (s *persistentSnapshotStore) ListSnapshots(context.Context) (map[string]SnapshotRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listCount++
	return cloneSnapshotRecords(s.records), nil
}

func (s *persistentSnapshotStore) ReplaceBaseline(_ context.Context, current map[string]SnapshotRecord, pruneIDs []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.replaceCount++
	s.lastCurrent = cloneSnapshotRecords(current)
	s.prune = append([]string(nil), pruneIDs...)
	s.records = cloneSnapshotRecords(current)
	for _, pruneID := range pruneIDs {
		delete(s.records, pruneID)
	}
	return nil
}

func (s *persistentSnapshotStore) replaceCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.replaceCount
}
