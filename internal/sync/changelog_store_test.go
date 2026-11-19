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
	provider := NewSQLiteProvider(db)
	if provider.DB() != db {
		t.Fatal("expected provider to expose the bootstrapped db handle")
	}
	store := NewChangelogStore(provider)
	ctx := context.Background()
	entry := ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    ChangelogTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"id":"anime-1","name":"Recorder","episodesWatched":2}`),
		ChangedAtMs:   1710000000123,
	}

	if err := insertWithAnime(ctx, db, store, entry); err != nil {
		t.Fatalf("insert pending changelog: %v", err)
	}

	assertSinglePendingChangelogRow(t, db, ctx, entry)
}

// assertSinglePendingChangelogRow verifies the persisted pending changelog row.
func assertSinglePendingChangelogRow(t *testing.T, db *sql.DB, ctx context.Context, entry ChangelogEntry) {
	t.Helper()
	var count int
	var animeID string
	var changeType string
	var changedFields string
	var snapshot string
	var status string
	var changedAtMs int64
	err := db.QueryRowContext(ctx, `SELECT COUNT(*), anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms FROM changelog`).Scan(
		&count,
		&animeID,
		&changeType,
		&changedFields,
		&snapshot,
		&status,
		&changedAtMs,
	)
	if err != nil {
		t.Fatalf("query changelog row: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 changelog row, got %d", count)
	}
	if animeID != entry.AnimeID || changeType != entry.ChangeType || changedFields != `["nrocapvisto"]` || snapshot != string(entry.SnapshotJSON) || status != "pending" || changedAtMs != entry.ChangedAtMs {
		t.Fatalf("unexpected changelog row: animeID=%q changeType=%q changedFields=%q snapshot=%q status=%q changedAtMs=%d", animeID, changeType, changedFields, snapshot, status, changedAtMs)
	}
}

func TestSQLiteChangelogStoreHandles100ConcurrentPendingInserts(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()

	const inserts = 100
	errCh := make(chan error, inserts)
	var wg sync.WaitGroup
	for i := range inserts {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			errCh <- insertWithAnime(ctx, db, store, ChangelogEntry{
				AnimeID:       fmt.Sprintf("anime-%03d", index),
				ChangeType:    ChangelogTypeUpdate,
				ChangedFields: []string{"nrocapvisto"},
				SnapshotJSON:  []byte(fmt.Sprintf(`{"id":"anime-%03d","episodesWatched":%d}`, index, index)),
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

// TestSQLiteChangelogStoreListsChangesSinceATimestampAfterAnIDAndOnlyPending
// lists changes since a timestamp with the last id and change time, the changes
// after an id, and only the pending rows newest first.
func TestSQLiteChangelogStoreListsChangesSinceATimestampAfterAnIDAndOnlyPending(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()

	entries := []ChangelogEntry{
		{AnimeID: "anime-1", ChangeType: ChangelogTypeCreate, ChangedFields: []string{"nombre"}, SnapshotJSON: []byte(`{"id":"anime-1"}`), ChangedAtMs: 100},
		{AnimeID: "anime-2", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"nrocapvisto"}, SnapshotJSON: []byte(`{"id":"anime-2"}`), ChangedAtMs: 200},
		{AnimeID: "anime-3", ChangeType: ChangelogTypeDelete, ChangedFields: nil, SnapshotJSON: nil, ChangedAtMs: 300},
	}
	for _, entry := range entries {
		if err := insertWithAnime(ctx, db, store, entry); err != nil {
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

	after, err := store.ListAfterID(ctx, got[0].ID)
	if err != nil {
		t.Fatalf("list after id: %v", err)
	}
	if len(after) != 1 || after[0].AnimeID != "anime-3" {
		t.Fatalf("expected only anime-3 after anime-2's id, got %#v", after)
	}
	assertListPendingSkipsAppliedRowsNewestFirst(ctx, t, db, store)
}

// assertListPendingSkipsAppliedRowsNewestFirst adds an applied row and checks
// ListPending returns only the three pending rows, newest first.
func assertListPendingSkipsAppliedRowsNewestFirst(ctx context.Context, t *testing.T, db *sql.DB, store *ChangelogStore) {
	t.Helper()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES ('anime-4', 'update', '[]', '{"id":"anime-4"}', 'applied', 500)
	`); err != nil {
		t.Fatalf("insert applied changelog row: %v", err)
	}
	pending, err := store.ListPending(ctx)
	if err != nil {
		t.Fatalf("list pending changelog rows: %v", err)
	}
	if len(pending) != 3 || pending[0].AnimeID != "anime-3" || pending[1].AnimeID != "anime-2" || pending[2].AnimeID != "anime-1" {
		t.Fatalf("expected newest-first pending rows anime-3, anime-2, anime-1, got %#v", pending)
	}
}

// TestSQLiteChangelogStoreUpsertsDeviceAcksAndPrunesForActiveDevicesIgnoringStaleOnes
// prunes up to the slowest active device, then ignores that device once stale.
func TestSQLiteChangelogStoreUpsertsDeviceAcksAndPrunesForActiveDevicesIgnoringStaleOnes(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()

	for i := 1; i <= 3; i++ {
		if err := insertWithAnime(ctx, db, store, ChangelogEntry{
			AnimeID:       "anime-1", // one anime: its last row survives a prune
			ChangeType:    ChangelogTypeUpdate,
			ChangedFields: []string{"nrocapvisto"},
			SnapshotJSON:  []byte(`{"id":"anime-1"}`),
			ChangedAtMs:   int64(100 + i),
		}); err != nil {
			t.Fatalf("insert changelog %d: %v", i, err)
		}
	}

	if err := store.AcknowledgeDevice(ctx, "device-1", 2, 1000); err != nil {
		t.Fatalf("ack device-1: %v", err)
	}
	if err := store.AcknowledgeDevice(ctx, "device-2", 1, 1000); err != nil {
		t.Fatalf("ack device-2: %v", err)
	}

	pruned, err := store.PruneAcknowledgedChangelog(ctx)
	if err != nil {
		t.Fatalf("prune acknowledged changelog: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("expected prune up to slowest active device (1 row), got %d", pruned)
	}

	got, err := store.ListAfterID(ctx, 0)
	if err != nil {
		t.Fatalf("list after prune: %v", err)
	}
	if len(got) != 2 || got[0].ID != 2 || got[1].ID != 3 {
		t.Fatalf("expected rows 2 and 3 to remain, got %#v", got)
	}

	// device-2 still holds the floor at row 1; once it is stale it no longer
	// blocks device-1's ack of row 3, so row 2 goes (3 is the anime's last).
	if err := store.AcknowledgeDevice(ctx, "device-1", 3, 1000); err != nil {
		t.Fatalf("ack device-1 again: %v", err)
	}
	if err := store.SetDeviceSyncStatus(ctx, "device-2", DeviceSyncStatusStale); err != nil {
		t.Fatalf("mark device-2 stale: %v", err)
	}
	pruned, err = store.PruneAcknowledgedChangelog(ctx)
	if err != nil {
		t.Fatalf("prune acknowledged changelog: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("expected the stale device not to block pruning row 2, got %d pruned rows", pruned)
	}
}

func TestSQLiteChangelogStoreEvaluatesDeviceStaleness(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	nowMs := int64(1_000_000_000)
	staleAfterMs := int64(60 * 24 * 60 * 60 * 1000)
	warnBeforeMs := int64(7 * 24 * 60 * 60 * 1000)

	if err := store.AcknowledgeDevice(ctx, "fresh", 10, nowMs-(10*24*60*60*1000)); err != nil {
		t.Fatalf("ack fresh: %v", err)
	}
	if err := store.AcknowledgeDevice(ctx, "warning", 10, nowMs-(55*24*60*60*1000)); err != nil {
		t.Fatalf("ack warning: %v", err)
	}
	if err := store.AcknowledgeDevice(ctx, "stale", 10, nowMs-(61*24*60*60*1000)); err != nil {
		t.Fatalf("ack stale: %v", err)
	}

	changed, err := store.EvaluateDeviceStaleness(ctx, nowMs, staleAfterMs, warnBeforeMs)
	if err != nil {
		t.Fatalf("evaluate device staleness: %v", err)
	}
	if len(changed) != 2 {
		t.Fatalf("expected 2 changed devices, got %#v", changed)
	}

	states, err := store.ListDeviceSyncStates(ctx)
	if err != nil {
		t.Fatalf("list device sync states: %v", err)
	}
	statuses := map[string]string{}
	for _, state := range states {
		statuses[state.DeviceID] = state.SyncStatus
	}
	if statuses["fresh"] != DeviceSyncStatusActive {
		t.Fatalf("expected fresh active, got %q", statuses["fresh"])
	}
	if statuses["warning"] != DeviceSyncStatusWarning {
		t.Fatalf("expected warning status, got %q", statuses["warning"])
	}
	if statuses["stale"] != DeviceSyncStatusStale {
		t.Fatalf("expected stale status, got %q", statuses["stale"])
	}
}

// countChangelogRows returns the number of persisted changelog rows.
func countChangelogRows(t *testing.T, db *sql.DB) int {
	t.Helper()

	var count int
	if err := db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM changelog`).Scan(&count); err != nil {
		t.Fatalf("count changelog rows: %v", err)
	}

	return count
}
