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

	assertSQLiteBaselineCatchUp(t, coordinator, publisher, store, logger)
}

// assertSQLiteBaselineCatchUp verifies integration catch-up persistence.
func assertSQLiteBaselineCatchUp(t *testing.T, coordinator anime.StartupCoordinator, publisher *integrationPublisher, store *bridgeSync.AnimeSnapshotStore, logger *integrationLogger) {
	t.Helper()
	if err := coordinator.Err(); err != nil {
		t.Fatal(err)
	}
	events := publisher.Events()
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}
	assertChangedPayload(t, events[0], "keep", `{"_id":"keep","nombre":"Updated","nrocapvisto":2}`)
	assertChangedPayload(t, events[1], "new", `{"_id":"new","nombre":"Brand New","nrocapvisto":3}`)
	assertSoftDeletedPayload(t, events[2], "gone", "Removed")
	baseline, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	gone, exists := baseline["gone"]
	if len(baseline) != 3 || !exists || !bytesContainsAll(gone.CanonicalJSON, `"activo":false`, `"fechaEliminacion"`) || len(logger.Messages()) != 0 {
		t.Fatalf("unexpected catch-up state: %#v", baseline)
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
	data := readOptionalRealFixture(t, sourcePath)
	if !strings.Contains(string(data), `"_id":"`+tombstonedID+`"`) {
		t.Fatalf("fixture no longer contains expected anchor id %q -- update test fixture references", tombstonedID)
	}

	tempPath := filepath.Join(t.TempDir(), "animes.dat")
	tombstoneLine := `{"_id":"` + tombstonedID + `","$$deleted":true}` + "\n"
	writeFixtureCopyWithTombstone(t, sourcePath, tempPath, data, tombstoneLine)

	db := openIntegrationBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedTombstonedBaseline(t, store, data, tombstonedID)
	runTombstoneCatchUp(t, tempPath, store)
	assertSoftDeletedFixtureSnapshot(t, store, tombstonedID, tombstonedNombre)
	queryService := anime.NewQueryService(store)
	assertSoftDeletedMobileAnime(t, queryService, tombstonedID)
	assertSoftDeletedAnimeItemVisible(t, queryService, tombstonedID)
}

// runTombstoneCatchUp executes the tombstone integration scenario.
func runTombstoneCatchUp(t *testing.T, tempPath string, store *bridgeSync.AnimeSnapshotStore) {
	t.Helper()
	coordinator := anime.NewStartupCoordinator(anime.StartupCoordinatorConfig{
		FilePath:  tempPath,
		Parser:    anime.NewSnapshotParser(),
		Store:     store,
		Publisher: &integrationPublisher{},
		Logger:    &integrationLogger{},
	})
	coordinator.StartAsync(context.Background())
	coordinator.Wait()
	if err := coordinator.Err(); err != nil {
		t.Fatalf("coordinator catch-up failed: %v", err)
	}
}

// assertSoftDeletedFixtureSnapshot verifies the persisted tombstone snapshot.
func assertSoftDeletedFixtureSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, tombstonedID string, tombstonedNombre string) {
	t.Helper()
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
}

// assertSoftDeletedMobileAnime verifies the soft-deleted mobile projection.
func assertSoftDeletedMobileAnime(t *testing.T, queryService *anime.QueryService, tombstonedID string) {
	t.Helper()
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
}

// readOptionalRealFixture reads a real fixture when it is available.
func readOptionalRealFixture(t *testing.T, sourcePath string) []byte {
	t.Helper()
	data, err := os.ReadFile(sourcePath)
	if err == nil {
		return data
	}
	if os.IsNotExist(err) {
		t.Skipf("real Autoreas fixture not present at %s; resources/autoreas-data/*.dat is gitignored private data", sourcePath)
	}
	t.Fatalf("read real fixture: %v", err)
	return nil
}

// writeFixtureCopyWithTombstone writes a fixture copy with a tombstone line.
func writeFixtureCopyWithTombstone(t *testing.T, sourcePath string, tempPath string, data []byte, tombstoneLine string) {
	t.Helper()
	if err := os.WriteFile(tempPath, append(data, []byte(tombstoneLine)...), 0o600); err != nil {
		t.Fatalf("write fixture copy with appended tombstone: %v", err)
	}
	unchanged, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("re-read original fixture: %v", err)
	}
	if string(unchanged) != string(data) {
		t.Fatal("source fixture under resources/autoreas-data/animes.dat was mutated -- must only ever copy to a temp dir")
	}
}

// seedTombstonedBaseline seeds the baseline used by tombstone tests.
func seedTombstonedBaseline(t *testing.T, store *bridgeSync.AnimeSnapshotStore, data []byte, tombstonedID string) {
	t.Helper()
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.Contains(line, `"_id":"`+tombstonedID+`"`) {
			continue
		}
		canonical := anime.HashSnapshot([]byte(line))
		seedBaseline(t, store, map[string]anime.SnapshotRecord{
			tombstonedID: {AnimeID: tombstonedID, CanonicalJSON: []byte(line), Hash: canonical},
		})
		return
	}
	t.Fatalf("expected fixture baseline line for %q", tombstonedID)
}

// assertSoftDeletedAnimeItemVisible verifies tombstones remain queryable.
func assertSoftDeletedAnimeItemVisible(t *testing.T, queryService *anime.QueryService, tombstonedID string) {
	t.Helper()
	items, err := queryService.ListAnimeItems(context.Background())
	if err != nil {
		t.Fatalf("list anime items: %v", err)
	}
	for _, item := range items {
		if item.ID != tombstonedID {
			continue
		}
		if item.Activo != 0 {
			t.Fatalf("expected soft-deleted record to report Activo=0 in anime list items, got %d", item.Activo)
		}
		return
	}
	t.Fatal("expected soft-deleted record to still be present (as inactive) in ListAnimeItems, not silently dropped")
}

// openIntegrationBridgeDB opens the SQLite database for integration tests.
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

// seedBaseline stores the initial integration snapshot baseline.
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

// assertChangedPayload verifies one changed-payload event.
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

// bytesContainsAll reports whether a payload contains every requested string.
func bytesContainsAll(payload []byte, substrings ...string) bool {
	text := string(payload)
	for _, substring := range substrings {
		if !strings.Contains(text, substring) {
			return false
		}
	}
	return true
}
