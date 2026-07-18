package anime

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRuntimeWatcherDetectsAtomicReplaceAndKeepsListening(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	dataPath := filepath.Join(dataDir, "animes.dat")
	writeAnimeDataFile(t, dataPath, []string{
		`{"_id":"keep","nombre":"Old","nrocapvisto":1}`,
	})

	store := &stubSnapshotStore{
		existing: map[string]SnapshotRecord{
			"keep": snapshotRecordFromPayload(t, `{"_id":"keep","nombre":"Old","nrocapvisto":1}`),
		},
	}
	publisher := &recordingPublisher{}
	watcher := NewRuntimeWatcher(RuntimeWatcherConfig{
		FilePath:       dataPath,
		Parser:         NewSnapshotParser(),
		Store:          store,
		Publisher:      publisher,
		Logger:         &recordingWarningLogger{},
		DebounceWindow: 25 * time.Millisecond,
		RetryDelay:     25 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.StartAsync(ctx)
	// Dejamos que fsnotify termine de registrar el directorio real antes del
	// rename/create. Sin esta pequeña espera, el test compite contra la
	// inicialización asíncrona del watcher y se vuelve flaky aunque el watcher
	// funcione bien una vez armado.
	time.Sleep(100 * time.Millisecond)

	replacedPath := filepath.Join(dataDir, "animes.tmp")
	if err := os.Rename(dataPath, replacedPath); err != nil {
		t.Fatalf("rename original anime data: %v", err)
	}
	writeAnimeDataFile(t, dataPath, []string{
		`{"_id":"keep","nombre":"Updated","nrocapvisto":2}`,
	})

	assertWatcherPublished(t, publisher, 1, "keep", `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)

	writeAnimeDataFile(t, dataPath, []string{
		`{"_id":"keep","nombre":"Updated","nrocapvisto":2}`,
		`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`,
	})

	assertWatcherPublished(t, publisher, 2, "new", `{"_id":"new","nombre":"Brand New","nrocapvisto":3}`)

	if err := watcher.Err(); err != nil {
		t.Fatalf("expected watcher integration to stay healthy, got %v", err)
	}

	cancel()
	watcher.Wait()
}

// assertWatcherPublished verifies a watcher event and payload.
func assertWatcherPublished(t *testing.T, publisher *recordingPublisher, count int, animeID, payload string) {
	t.Helper()
	eventuallyWithin(t, 3*time.Second, func() bool { return len(publisher.events()) >= count })
	eventsList := publisher.events()
	assertPublishedAnimeChanged(t, eventsList[len(eventsList)-1], animeID, payload)
}

// writeAnimeDataFile writes test lines to an anime data file.
func writeAnimeDataFile(t *testing.T, filePath string, lines []string) {
	t.Helper()
	contents := []byte("")
	for _, line := range lines {
		contents = append(contents, []byte(line+"\n")...)
	}
	if err := os.WriteFile(filePath, contents, 0o600); err != nil {
		t.Fatalf("write anime data file: %v", err)
	}
}
