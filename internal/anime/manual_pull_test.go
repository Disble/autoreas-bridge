package anime

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

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
