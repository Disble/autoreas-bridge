package sync

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

func TestSQLiteAnimeSnapshotStoreReplaceBaselineUpsertsAndPrunes(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	txnStore := NewAnimeSnapshotStore(db)
	ctx := context.Background()

	seed := map[string]anime.SnapshotRecord{
		"stale": {AnimeID: "stale", CanonicalJSON: []byte(`{"_id":"stale","nombre":"Old","nrocapvisto":1}`), Hash: anime.HashSnapshot([]byte(`{"_id":"stale","nombre":"Old","nrocapvisto":1}`))},
		"keep":  {AnimeID: "keep", CanonicalJSON: []byte(`{"_id":"keep","nombre":"Old Keep","nrocapvisto":1}`), Hash: anime.HashSnapshot([]byte(`{"_id":"keep","nombre":"Old Keep","nrocapvisto":1}`))},
	}
	if err := txnStore.ReplaceBaseline(ctx, seed, nil); err != nil {
		t.Fatalf("seed baseline: %v", err)
	}

	current := map[string]anime.SnapshotRecord{
		"keep": {AnimeID: "keep", CanonicalJSON: []byte(`{"_id":"keep","nombre":"New Keep","nrocapvisto":2}`), Hash: anime.HashSnapshot([]byte(`{"_id":"keep","nombre":"New Keep","nrocapvisto":2}`))},
		"new":  {AnimeID: "new", CanonicalJSON: []byte(`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`), Hash: anime.HashSnapshot([]byte(`{"_id":"new","nombre":"Brand New","nrocapvisto":3}`))},
	}

	if err := txnStore.ReplaceBaseline(ctx, current, []string{"stale"}); err != nil {
		t.Fatalf("replace baseline: %v", err)
	}

	got, err := txnStore.ListSnapshots(ctx)
	if err != nil {
		t.Fatalf("list snapshots: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 snapshots after pruning, got %d", len(got))
	}

	if _, ok := got["stale"]; ok {
		t.Fatal("expected stale snapshot to be pruned")
	}

	if got["keep"].Hash != current["keep"].Hash {
		t.Fatalf("expected keep hash %q, got %q", current["keep"].Hash, got["keep"].Hash)
	}

	if string(got["new"].CanonicalJSON) != string(current["new"].CanonicalJSON) {
		t.Fatalf("expected new snapshot json %s, got %s", string(current["new"].CanonicalJSON), string(got["new"].CanonicalJSON))
	}
}

func TestSQLiteAnimeSnapshotStoreReplaceBaselinePersistsModifiedAt(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewAnimeSnapshotStore(db)
	ctx := context.Background()

	payload := []byte(`{"_id":"anime-1","nombre":"Token","nrocapvisto":1}`)
	seed := map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: payload, Hash: anime.HashSnapshot(payload), ModifiedAt: 12345},
	}
	if err := store.ReplaceBaseline(ctx, seed, nil); err != nil {
		t.Fatalf("seed baseline: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 12345 {
		t.Fatalf("expected round-tripped ModifiedAt 12345, got %d", got.ModifiedAt)
	}

	listed, err := store.ListSnapshots(ctx)
	if err != nil {
		t.Fatalf("list snapshots: %v", err)
	}
	if listed["anime-1"].ModifiedAt != 12345 {
		t.Fatalf("expected listed ModifiedAt 12345, got %d", listed["anime-1"].ModifiedAt)
	}

	updatedPayload := []byte(`{"_id":"anime-1","nombre":"Token Updated","nrocapvisto":2}`)
	update := map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: updatedPayload, Hash: anime.HashSnapshot(updatedPayload), ModifiedAt: 99999},
	}
	if err := store.ReplaceBaseline(ctx, update, nil); err != nil {
		t.Fatalf("replace baseline: %v", err)
	}

	got, err = store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot after update: %v", err)
	}
	if got.ModifiedAt != 99999 {
		t.Fatalf("expected updated ModifiedAt 99999, got %d", got.ModifiedAt)
	}
}

func TestSQLiteAnimeSnapshotStoreGetSnapshot(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewAnimeSnapshotStore(db)
	ctx := context.Background()
	payload := []byte(`{"_id":"anime-1","nombre":"Lookup","nrocapvisto":1}`)

	if err := store.ReplaceBaseline(ctx, map[string]anime.SnapshotRecord{
		"anime-1": {AnimeID: "anime-1", CanonicalJSON: payload, Hash: anime.HashSnapshot(payload)},
	}, nil); err != nil {
		t.Fatalf("seed baseline: %v", err)
	}

	record, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}

	if record.AnimeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", record.AnimeID)
	}

	if string(record.CanonicalJSON) != string(payload) {
		t.Fatalf("expected snapshot json %s, got %s", string(payload), string(record.CanonicalJSON))
	}
}

func TestSQLiteAnimeSnapshotStoreGetSnapshotReturnsNotFound(t *testing.T) {
	t.Parallel()

	store := NewAnimeSnapshotStore(openTestBridgeDB(t))
	_, err := store.GetSnapshot(context.Background(), "missing")
	if !errors.Is(err, contracts.ErrAnimeNotFound) {
		t.Fatalf("expected ErrAnimeNotFound, got %v", err)
	}
}

// openTestBridgeDB opens the SQLite database used by snapshot tests.
func openTestBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open test bridge db: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })

	return db
}
