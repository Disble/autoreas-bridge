package anime

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
)

func TestUpdateWriterAppendsOneLineAndWatcherIgnoresSelfEcho(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	dataPath := filepath.Join(dataDir, "animes.dat")
	writeAnimeDataFile(t, dataPath, []string{
		`{"_id":"seed","nombre":"Seed","nrocapvisto":1}`,
	})

	bus := events.NewBus()
	selfEcho := NewSelfEchoRegistry()
	watcherPublisher := &recordingPublisher{}
	watcherStore := &stubSnapshotStore{
		existing: map[string]SnapshotRecord{
			"seed": snapshotRecordFromPayload(t, `{"_id":"seed","nombre":"Seed","nrocapvisto":1}`),
		},
	}
	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:         dataPath,
		Parser:           NewSnapshotParser(),
		Store:            watcherStore,
		Publisher:        watcherPublisher,
		Logger:           &recordingWarningLogger{},
		SelfEchoRegistry: selfEcho,
		DebounceWindow:   25 * time.Millisecond,
		RetryDelay:       25 * time.Millisecond,
	})
	writerPublisher := &recordingPublisher{}
	writer := NewUpdateWriter(UpdateWriterConfig{
		FilePath:         dataPath,
		Bus:              bus,
		Publisher:        writerPublisher,
		Logger:           &recordingWarningLogger{},
		SelfEchoRegistry: selfEcho,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	writer.StartAsync(ctx)

	payload := []byte(`{"_id":"anime-2","nombre":"Writer","nrocapvisto":2}`)
	bus.Publish(events.AnimeUpdateRequestedEvent{AnimeID: "anime-2", Payload: payload})

	eventuallyWithin(t, time.Second, func() bool {
		return len(writerPublisher.events()) == 1
	})

	assertPublishedAnimeChanged(t, writerPublisher.events()[0], "anime-2", string(payload))

	time.Sleep(150 * time.Millisecond)

	if got := len(watcherPublisher.events()); got != 0 {
		t.Fatalf("expected watcher to ignore self-echo, got %d duplicate events", got)
	}

	assertAppendedAnimeData(t, dataPath, payload)

	cancel()
	writer.Wait()
	watcher.Wait()
}

// assertAppendedAnimeData verifies the appended anime data file.
func assertAppendedAnimeData(t *testing.T, dataPath string, payload []byte) {
	t.Helper()
	contents, err := os.ReadFile(dataPath)
	if err != nil {
		t.Fatalf("read anime data file: %v", err)
	}
	lines := splitNonEmptyLines(string(contents))
	if len(lines) != 2 {
		t.Fatalf("expected append-only file with 2 lines, got %d", len(lines))
	}
	if lines[0] != `{"_id":"seed","nombre":"Seed","nrocapvisto":1}` || lines[1] != string(payload) {
		t.Fatalf("unexpected append-only lines: %v", lines)
	}
}

// splitNonEmptyLines returns non-empty lines from file content.
func splitNonEmptyLines(input string) []string {
	lines := make([]string, 0)
	current := ""
	for _, r := range input {
		if r == '\n' {
			if current != "" {
				lines = append(lines, current)
			}
			current = ""
			continue
		}
		if r == '\r' {
			continue
		}
		current += string(r)
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}
