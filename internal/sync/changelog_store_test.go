package sync

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestSQLiteChangelogStoreInsertsPendingRow(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()
	entry := ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    ChangelogTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"Recorder","nrocapvisto":2}`),
		ChangedAtMs:   1710000000123,
	}

	if err := store.InsertPending(ctx, entry); err != nil {
		t.Fatalf("insert pending changelog: %v", err)
	}

	rows, err := db.QueryContext(ctx, `SELECT anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms FROM changelog`)
	if err != nil {
		t.Fatalf("query changelog rows: %v", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
		var animeID string
		var changeType string
		var changedFields string
		var snapshot string
		var status string
		var changedAtMs int64
		if err := rows.Scan(&animeID, &changeType, &changedFields, &snapshot, &status, &changedAtMs); err != nil {
			t.Fatalf("scan changelog row: %v", err)
		}
		if animeID != entry.AnimeID {
			t.Fatalf("expected anime id %q, got %q", entry.AnimeID, animeID)
		}
		if changeType != entry.ChangeType {
			t.Fatalf("expected change type %q, got %q", entry.ChangeType, changeType)
		}
		if changedFields != `["nrocapvisto"]` {
			t.Fatalf("expected changed fields json, got %s", changedFields)
		}
		if snapshot != string(entry.SnapshotJSON) {
			t.Fatalf("expected snapshot %s, got %s", string(entry.SnapshotJSON), snapshot)
		}
		if status != "pending" {
			t.Fatalf("expected status pending, got %q", status)
		}
		if changedAtMs != entry.ChangedAtMs {
			t.Fatalf("expected changed_at_ms %d, got %d", entry.ChangedAtMs, changedAtMs)
		}
	}

	if err := rows.Err(); err != nil {
		t.Fatalf("iterate changelog rows: %v", err)
	}

	if count != 1 {
		t.Fatalf("expected 1 changelog row, got %d", count)
	}
}

func TestBootstrapBridgeDBCreatesChangelogTable(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	if !tableExists(t, db, "changelog") {
		t.Fatal("expected changelog table to exist after bootstrap")
	}
}

func TestSQLiteChangelogStoreHandles100ConcurrentPendingInserts(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()

	const inserts = 100
	errCh := make(chan error, inserts)
	var wg sync.WaitGroup
	for i := 0; i < inserts; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			errCh <- store.InsertPending(ctx, ChangelogEntry{
				AnimeID:       fmt.Sprintf("anime-%03d", index),
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"nrocapvisto"},
				SnapshotJSON:  []byte(fmt.Sprintf(`{"_id":"anime-%03d","nrocapvisto":%d}`, index, index)),
				ChangedAtMs:   int64(1710000000000 + index),
			})
		}(i)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err == nil {
			continue
		}
		if strings.Contains(err.Error(), "database is locked") || strings.Contains(err.Error(), "SQLITE_BUSY") {
			t.Fatalf("expected no SQLITE_BUSY/database is locked errors, got %v", err)
		}
		t.Fatalf("insert pending changelog: %v", err)
	}

	if count := countChangelogRows(t, db); count != inserts {
		t.Fatalf("expected %d changelog rows, got %d", inserts, count)
	}
}

func TestSQLiteChangelogStoreListsChangesSinceTimestamp(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()

	entries := []ChangelogEntry{
		{AnimeID: "anime-1", ChangeType: ChangelogTypeCreate, ChangedFields: []string{"nombre"}, SnapshotJSON: []byte(`{"_id":"anime-1"}`), ChangedAtMs: 100},
		{AnimeID: "anime-2", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"nrocapvisto"}, SnapshotJSON: []byte(`{"_id":"anime-2"}`), ChangedAtMs: 200},
		{AnimeID: "anime-3", ChangeType: ChangelogTypeDelete, ChangedFields: nil, SnapshotJSON: nil, ChangedAtMs: 300},
	}
	for _, entry := range entries {
		if err := store.InsertPending(ctx, entry); err != nil {
			t.Fatalf("insert pending changelog: %v", err)
		}
	}

	got, err := store.ListSinceTimestamp(ctx, 150)
	if err != nil {
		t.Fatalf("list changes since timestamp: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 changes, got %d", len(got))
	}
	if got[0].AnimeID != "anime-2" || got[1].AnimeID != "anime-3" {
		t.Fatalf("unexpected change order/content: %#v", got)
	}

	lastID, err := store.LastID(ctx)
	if err != nil {
		t.Fatalf("last changelog id: %v", err)
	}
	if lastID != got[1].ID {
		t.Fatalf("expected last id %d to match newest row id %d", lastID, got[1].ID)
	}

	lastChangedAt, err := store.LastChangedAt(ctx)
	if err != nil {
		t.Fatalf("last changed at: %v", err)
	}
	if lastChangedAt == nil || *lastChangedAt != 300 {
		t.Fatalf("expected last changed at 300, got %#v", lastChangedAt)
	}
}

func TestSQLiteChangelogStoreListsChangesAfterID(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()

	first := ChangelogEntry{AnimeID: "anime-1", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"estado"}, SnapshotJSON: []byte(`{"_id":"anime-1"}`), ChangedAtMs: 100}
	second := ChangelogEntry{AnimeID: "anime-2", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"nrocapvisto"}, SnapshotJSON: []byte(`{"_id":"anime-2"}`), ChangedAtMs: 200}
	if err := store.InsertPending(ctx, first); err != nil {
		t.Fatalf("insert first changelog: %v", err)
	}
	if err := store.InsertPending(ctx, second); err != nil {
		t.Fatalf("insert second changelog: %v", err)
	}

	all, err := store.ListSinceTimestamp(ctx, 0)
	if err != nil {
		t.Fatalf("list all changes: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(all))
	}

	got, err := store.ListAfterID(ctx, all[0].ID)
	if err != nil {
		t.Fatalf("list after id: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 row after id, got %d", len(got))
	}
	if got[0].AnimeID != "anime-2" {
		t.Fatalf("expected anime-2, got %#v", got[0])
	}
}

func TestSQLiteChangelogStoreListsOnlyPendingRowsNewestFirst(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSyncSQLiteProvider(db))
	ctx := context.Background()

	if err := store.InsertPending(ctx, ChangelogEntry{AnimeID: "anime-1", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"estado"}, SnapshotJSON: []byte(`{"_id":"anime-1"}`), ChangedAtMs: 100}); err != nil {
		t.Fatalf("insert first pending changelog: %v", err)
	}
	if err := store.InsertPending(ctx, ChangelogEntry{AnimeID: "anime-2", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"nrocapvisto"}, SnapshotJSON: []byte(`{"_id":"anime-2"}`), ChangedAtMs: 300}); err != nil {
		t.Fatalf("insert second pending changelog: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES ('anime-3', 'update', '[]', '{"_id":"anime-3"}', 'applied', 500)
	`); err != nil {
		t.Fatalf("insert applied changelog row: %v", err)
	}

	got, err := store.ListPending(ctx)
	if err != nil {
		t.Fatalf("list pending changelog rows: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 pending rows, got %d", len(got))
	}
	if got[0].AnimeID != "anime-2" || got[1].AnimeID != "anime-1" {
		t.Fatalf("expected newest-first pending rows, got %#v", got)
	}
}

func countChangelogRows(t *testing.T, db *sql.DB) int {
	t.Helper()

	var count int
	if err := db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM changelog`).Scan(&count); err != nil {
		t.Fatalf("count changelog rows: %v", err)
	}

	return count
}
