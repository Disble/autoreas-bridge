package anime_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestStartupCoordinatorCatchUpIntegrationWithSQLiteBaseline(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	dataPath := filepath.Join(tempDir, "animes.dat")
	if err := os.WriteFile(dataPath, []byte("{"+`"_id":"keep","nombre":"Updated","nrocapvisto":2}`+"\n{"+`"_id":"new","nombre":"Brand New","nrocapvisto":3}`+"\n"), 0o600); err != nil {
		t.Fatalf("write anime data fixture: %v", err)
	}

	db := openIntegrationBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedBaseline(t, store, map[string]anime.SnapshotRecord{
		"keep": {
			AnimeID:       "keep",
			CanonicalJSON: []byte(`{"_id":"keep","nombre":"Old","nrocapvisto":1}`),
			Hash:          anime.HashSnapshot([]byte(`{"_id":"keep","nombre":"Old","nrocapvisto":1}`)),
		},
		"gone": {
			AnimeID:       "gone",
			CanonicalJSON: []byte(`{"_id":"gone","nombre":"Removed","nrocapvisto":1}`),
			Hash:          anime.HashSnapshot([]byte(`{"_id":"gone","nombre":"Removed","nrocapvisto":1}`)),
		},
	})

	publisher := &integrationPublisher{}
	logger := &integrationLogger{}
	coordinator := anime.NewStartupCoordinator(anime.StartupCoordinatorConfig{
		FilePath:  dataPath,
		Parser:    anime.NewSnapshotParser(),
		Store:     store,
		Publisher: publisher,
		Logger:    logger,
	})

	coordinator.StartAsync(context.Background())
	coordinator.Wait()

	if err := coordinator.Err(); err != nil {
		t.Fatalf("coordinator catch-up failed: %v", err)
	}

	published := publisher.Events()
	if len(published) != 3 {
		t.Fatalf("expected 3 retroactive events, got %d", len(published))
	}

	assertChangedPayload(t, published[0], "keep", `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)
	assertChangedPayload(t, published[1], "new", `{"_id":"new","nombre":"Brand New","nrocapvisto":3}`)
	assertDeletedPayload(t, published[2], "gone")

	baseline, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list snapshots after catch-up: %v", err)
	}

	if len(baseline) != 2 {
		t.Fatalf("expected 2 snapshots in sqlite after pruning, got %d", len(baseline))
	}

	if _, exists := baseline["gone"]; exists {
		t.Fatal("expected gone snapshot to be pruned from sqlite")
	}

	if len(logger.Messages()) != 0 {
		t.Fatalf("expected no warnings for clean fixture, got %v", logger.Messages())
	}
}

func openIntegrationBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open integration bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func seedBaseline(t *testing.T, store *bridgeSync.AnimeSnapshotStore, current map[string]anime.SnapshotRecord) {
	t.Helper()
	if err := store.ReplaceBaseline(context.Background(), current, nil); err != nil {
		t.Fatalf("seed baseline: %v", err)
	}
}

type integrationPublisher struct {
	mu     sync.Mutex
	events []events.Event
}

func (p *integrationPublisher) Publish(event events.Event) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, event)
}

func (p *integrationPublisher) Events() []events.Event {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]events.Event, len(p.events))
	copy(out, p.events)
	return out
}

type integrationLogger struct {
	mu       sync.Mutex
	messages []string
}

func (l *integrationLogger) Warnf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.messages = append(l.messages, time.Now().Format(time.RFC3339Nano))
}

func (l *integrationLogger) Messages() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, len(l.messages))
	copy(out, l.messages)
	return out
}

func assertChangedPayload(t *testing.T, event events.Event, wantID, wantPayload string) {
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

func assertDeletedPayload(t *testing.T, event events.Event, wantID string) {
	t.Helper()
	changed, ok := event.(events.AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", event)
	}
	if changed.AnimeID != wantID {
		t.Fatalf("expected anime id %q, got %q", wantID, changed.AnimeID)
	}
	if changed.Payload != nil {
		t.Fatalf("expected nil payload delete, got %s", string(changed.Payload))
	}
}
