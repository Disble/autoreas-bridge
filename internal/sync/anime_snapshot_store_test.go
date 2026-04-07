package sync

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
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

func openTestBridgeDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open test bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}
