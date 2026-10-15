package sync

import (
	"context"
	"database/sql"
	"testing"
)

// prunableChangelog stores rows 1..4 — anime a at 100 and 105, anime b at 110 and 120 — and has
// device-1 acknowledge all of them.
func prunableChangelog(t *testing.T) (*sql.DB, *ChangelogStore) {
	t.Helper()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	for _, row := range []struct {
		animeID string
		at      int64
	}{{"a", 100}, {"a", 105}, {"b", 110}, {"b", 120}} {
		must(t, insertWithAnime(ctx, db, store, ChangelogEntry{AnimeID: row.animeID, ChangeType: ChangelogTypeUpdate,
			ChangedFields: []string{"name"}, SnapshotJSON: []byte(`{"id":"` + row.animeID + `"}`), ChangedAtMs: row.at}))
	}
	must(t, store.AcknowledgeDevice(ctx, "device-1", 4, 1000))
	return db, store
}

// remainingIDs lists the ids still in the changelog.
func remainingIDs(t *testing.T, store *ChangelogStore) []int64 {
	t.Helper()

	rows, err := store.ListAfterID(context.Background(), 0)
	must(t, err)
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	return ids
}

func TestPruneKeepsTheLastRowOfEachAnime(t *testing.T) {
	t.Parallel()

	_, store := prunableChangelog(t)

	pruned, err := store.PruneAcknowledgedChangelog(context.Background())
	must(t, err)

	if pruned != 2 {
		t.Errorf("want the 2 older rows pruned, got %d", pruned)
	}
	if got := remainingIDs(t, store); len(got) != 2 || got[0] != 2 || got[1] != 4 {
		t.Errorf("want each anime's last row (2 and 4) kept, got %v", got)
	}
}

func TestPruneKeepsTheClockFloorForTheNextChange(t *testing.T) {
	t.Parallel()

	db, store := prunableChangelog(t)
	ctx := context.Background()
	_, err := store.PruneAcknowledgedChangelog(ctx)
	must(t, err)

	// The bridge clock went back past the acknowledged change: the next row must still rise.
	must(t, insertWithAnime(ctx, db, store, ChangelogEntry{AnimeID: "b", ChangeType: ChangelogTypeUpdate,
		ChangedFields: []string{"name"}, SnapshotJSON: []byte(`{"id":"b"}`), ChangedAtMs: 90}))

	rows, err := store.ListAfterID(ctx, 4)
	must(t, err)
	if len(rows) != 1 || rows[0].ChangedAtMs != 121 {
		t.Fatalf("want the new row stamped past the kept 120, got %+v", rows)
	}
}

func TestPruneDropsEveryRowOfAnAnimeThatIsGone(t *testing.T) {
	t.Parallel()

	db, store := prunableChangelog(t)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `DELETE FROM anime_snapshots WHERE anime_id = 'a'`); err != nil {
		t.Fatalf("remove anime a: %v", err)
	}

	pruned, err := store.PruneAcknowledgedChangelog(ctx)
	must(t, err)

	if pruned != 3 {
		t.Errorf("want both rows of the gone anime and b's older row pruned, got %d", pruned)
	}
	if got := remainingIDs(t, store); len(got) != 1 || got[0] != 4 {
		t.Errorf("want only b's last row kept, got %v", got)
	}
}

func TestPruneLeavesRowsNotYetAcknowledged(t *testing.T) {
	t.Parallel()

	_, store := prunableChangelog(t)
	ctx := context.Background()
	must(t, store.AcknowledgeDevice(ctx, "device-2", 1, 1000))

	pruned, err := store.PruneAcknowledgedChangelog(ctx)
	must(t, err)

	if pruned != 1 {
		t.Errorf("only row 1 is acknowledged by every device and is not a's last; want 1 pruned, got %d", pruned)
	}
	if got := remainingIDs(t, store); len(got) != 3 || got[0] != 2 {
		t.Errorf("want rows 2, 3 and 4 kept, got %v", got)
	}
}

// TestSyncingPanelIsEmptyOnceEveryDeviceAcknowledged pins what the Devices page "Syncing Now"
// panel showed before the prune kept rows: nothing, once every active device acknowledged.
func TestSyncingPanelIsEmptyOnceEveryDeviceAcknowledged(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	svc := NewTriggerService(nil, store)
	ctx := context.Background()
	for i, id := range []string{"a", "b"} {
		must(t, insertWithAnime(ctx, db, store, ChangelogEntry{AnimeID: id, ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"name"},
			SnapshotJSON: []byte(`{"id":"` + id + `","name":"` + id + `","active":1}`), ChangedAtMs: int64(100 + i)}))
	}
	must(t, svc.AcknowledgeDevice(ctx, "d1", 2))

	items, err := svc.ListPendingAnimeSyncs(ctx)
	must(t, err)
	if len(items) != 0 {
		t.Fatalf("every device acknowledged, yet Syncing Now lists %+v", items)
	}
}

// TestSyncingPanelCountsOnlyWhatTheSlowestDeviceLacks keeps rows a device still lacks in the panel,
// with a count that leaves out the rows every device already has.
func TestSyncingPanelCountsOnlyWhatTheSlowestDeviceLacks(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	svc := NewTriggerService(nil, store)
	ctx := context.Background()
	for i := range 3 {
		must(t, insertWithAnime(ctx, db, store, ChangelogEntry{AnimeID: "a", ChangeType: ChangelogTypeUpdate, ChangedFields: []string{"name"},
			SnapshotJSON: []byte(`{"id":"a","name":"a","active":1}`), ChangedAtMs: int64(100 + i)}))
	}
	must(t, svc.AcknowledgeDevice(ctx, "slow", 1))
	must(t, svc.AcknowledgeDevice(ctx, "fast", 3))

	items, err := svc.ListPendingAnimeSyncs(ctx)
	must(t, err)
	if len(items) != 1 || items[0].PendingChanges != 2 {
		t.Fatalf("want anime a with the 2 changes the slow device lacks, got %+v", items)
	}
}
