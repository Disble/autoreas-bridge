package anime_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
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
	assertSoftDeletedPayload(t, published[2], "gone", "Removed")

	baseline, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list snapshots after catch-up: %v", err)
	}

	// SDD-30 ADR-30-3b: a baseline record absent from the latest parse is
	// soft-deleted (Activo=0 + FechaEliminacion), never physically pruned.
	if len(baseline) != 3 {
		t.Fatalf("expected 3 snapshots in sqlite after soft-delete (no physical prune), got %d", len(baseline))
	}

	gone, exists := baseline["gone"]
	if !exists {
		t.Fatal("expected gone snapshot to be retained (soft-deleted) in sqlite, not pruned")
	}
	if !bytesContainsAll(gone.CanonicalJSON, `"activo":false`, `"fechaEliminacion"`) {
		t.Fatalf("expected gone snapshot to carry activo=false + fechaEliminacion, got %s", string(gone.CanonicalJSON))
	}

	if len(logger.Messages()) != 0 {
		t.Fatalf("expected no warnings for clean fixture, got %v", logger.Messages())
	}
}

// TestStartupCoordinatorCatchUpSoftDeletesRealFixtureTombstone validates
// SDD-30 ADR-30-3b against the real autoreas-data fixture (task 2.3): a
// $$deleted tombstone line for a real record must never physically prune
// the SQLite row -- it must soft-delete it (activo=false +
// fechaEliminacion) while preserving every other field from the original
// payload. The fixture is copied to a temp dir and the tombstone is
// appended to the COPY; the source .dat under resources/ is never mutated.
func TestStartupCoordinatorCatchUpSoftDeletesRealFixtureTombstone(t *testing.T) {
	t.Parallel()

	const tombstonedID = "02LBUHyycWlg1l63"
	const tombstonedNombre = "Layton Mystery Tanteisha: Katri no Nazotoki File"

	sourcePath := filepath.Join("..", "..", "resources", "autoreas-data", "animes.dat")
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real Autoreas fixture not present at %s; resources/autoreas-data/*.dat is gitignored private data", sourcePath)
		}
		t.Fatalf("read real fixture: %v", err)
	}
	if !strings.Contains(string(data), `"_id":"`+tombstonedID+`"`) {
		t.Fatalf("fixture no longer contains expected anchor id %q -- update test fixture references", tombstonedID)
	}

	tempPath := filepath.Join(t.TempDir(), "animes.dat")
	tombstoneLine := `{"_id":"` + tombstonedID + `","$$deleted":true}` + "\n"
	if err := os.WriteFile(tempPath, append(data, []byte(tombstoneLine)...), 0o600); err != nil {
		t.Fatalf("write fixture copy with appended tombstone: %v", err)
	}

	// The original fixture under resources/ must remain untouched.
	unchanged, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("re-read original fixture: %v", err)
	}
	if string(unchanged) != string(data) {
		t.Fatal("source fixture under resources/autoreas-data/animes.dat was mutated -- must only ever copy to a temp dir")
	}

	db := openIntegrationBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)

	// Seed the baseline with the to-be-tombstoned record exactly as the
	// fixture defines it, mirroring a prior successful catch-up/watch cycle
	// that already persisted this row before the tombstone line was added.
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.Contains(line, `"_id":"`+tombstonedID+`"`) {
			continue
		}
		canonical := anime.HashSnapshot([]byte(line))
		seedBaseline(t, store, map[string]anime.SnapshotRecord{
			tombstonedID: {AnimeID: tombstonedID, CanonicalJSON: []byte(line), Hash: canonical},
		})
		break
	}

	publisher := &integrationPublisher{}
	logger := &integrationLogger{}
	coordinator := anime.NewStartupCoordinator(anime.StartupCoordinatorConfig{
		FilePath:  tempPath,
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

	record, err := store.GetSnapshot(context.Background(), tombstonedID)
	if err != nil {
		t.Fatalf("get soft-deleted snapshot: %v", err)
	}

	payload := string(record.CanonicalJSON)
	for _, want := range []string{`"activo":false`, `"fechaEliminacion"`, `"nombre":"` + tombstonedNombre + `"`} {
		if !strings.Contains(payload, want) {
			t.Fatalf("expected soft-deleted real-fixture payload to contain %q, got %s", want, payload)
		}
	}

	all, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list snapshots: %v", err)
	}
	if _, exists := all[tombstonedID]; !exists {
		t.Fatal("expected tombstoned anime to remain present in sqlite (soft-deleted, not pruned)")
	}

	// Mobile mapping must surface the soft-delete as Activo=0 (SDD-30
	// ADR-30-3b), and the record's id must not silently vanish from the
	// mobile list endpoint either -- it is retained, just marked inactive.
	queryService := anime.NewQueryService(store)
	mobileAnime, err := queryService.GetMobileAnime(context.Background(), tombstonedID)
	if err != nil {
		t.Fatalf("get mobile anime for soft-deleted record: %v", err)
	}
	if mobileAnime.Activo != 0 {
		t.Fatalf("expected soft-deleted record to report Activo=0 in mobile mapping, got %d", mobileAnime.Activo)
	}
	if mobileAnime.FechaEliminacion == nil {
		t.Fatal("expected soft-deleted record to report a non-nil FechaEliminacion in mobile mapping")
	}

	items, err := queryService.ListAnimeItems(context.Background())
	if err != nil {
		t.Fatalf("list anime items: %v", err)
	}
	found := false
	for _, item := range items {
		if item.ID != tombstonedID {
			continue
		}
		found = true
		if item.Activo != 0 {
			t.Fatalf("expected soft-deleted record to report Activo=0 in anime list items, got %d", item.Activo)
		}
	}
	if !found {
		t.Fatal("expected soft-deleted record to still be present (as inactive) in ListAnimeItems, not silently dropped")
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

// assertSoftDeletedPayload verifies a catch-up delta for a baseline record
// absent from the latest parse is a soft-delete UPDATE (SDD-30 ADR-30-3b):
// non-nil payload, activo=false, fechaEliminacion set, and the original
// nombre preserved -- never a nil-payload physical delete event.
func assertSoftDeletedPayload(t *testing.T, event events.Event, wantID, wantNombre string) {
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
	if !bytesContainsAll(changed.Payload, `"activo":false`, `"fechaEliminacion"`, `"nombre":"`+wantNombre+`"`) {
		t.Fatalf("expected soft-delete payload with activo=false + fechaEliminacion + nombre=%q, got %s", wantNombre, string(changed.Payload))
	}
}

func bytesContainsAll(payload []byte, substrings ...string) bool {
	text := string(payload)
	for _, substring := range substrings {
		if !strings.Contains(text, substring) {
			return false
		}
	}
	return true
}
