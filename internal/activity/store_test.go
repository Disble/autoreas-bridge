package activity_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/activity"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestStoreRecordsAndListsAnimeActivity(t *testing.T) {
	ctx := context.Background()
	db := openActivityTestDB(t)
	store := activity.NewStore(activity.NewSQLiteProvider(db))

	err := store.RecordActivity(ctx, activity.Record{
		Source:        activity.SourceDesktop,
		ActionType:    activity.ActionEpisodeAdjusted,
		AnimeID:       "anime-1",
		AnimeName:     "Dungeon Meshi",
		OccurredAtMs:  1710000000123,
		CorrelationID: "corr-1",
		BeforeJSON:    []byte(`{"episodesWatched":2.5,"status":0}`),
		AfterJSON:     []byte(`{"episodesWatched":3,"status":0}`),
	})
	if err != nil {
		t.Fatalf("record activity: %v", err)
	}

	got, err := store.ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list recent activity: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 activity row, got %#v", got)
	}
	row := got[0]
	if row.Source != activity.SourceDesktop || row.ActionType != activity.ActionEpisodeAdjusted {
		t.Fatalf("unexpected source/action: %#v", row)
	}
	if row.AnimeID != "anime-1" || row.AnimeName != "Dungeon Meshi" {
		t.Fatalf("unexpected anime identity: %#v", row)
	}
	if string(row.BeforeJSON) != `{"episodesWatched":2.5,"status":0}` {
		t.Fatalf("unexpected before json: %s", row.BeforeJSON)
	}
	if string(row.AfterJSON) != `{"episodesWatched":3,"status":0}` {
		t.Fatalf("unexpected after json: %s", row.AfterJSON)
	}
}

func TestBridgeBootstrapCreatesActivityLogSchema(t *testing.T) {
	db := openActivityTestDB(t)

	assertTableExists(t, db, "activity_log")
	assertIndexExists(t, db, "idx_activity_log_occurred_at")
	assertIndexExists(t, db, "idx_activity_log_anime")
	assertIndexExists(t, db, "idx_activity_log_action")
	assertIndexExists(t, db, "idx_activity_log_correlation")
}

// TestStoreCountsAndStreamsRowsOldestFirst proves CountReplayable counts the
// whole replay input and StreamOldestFirst yields it in occurred_at_ms ASC,
// id ASC order, decoding before/after into the exact untagged Snapshot shape
// (CLAUDE.md #13).
func TestStoreCountsAndStreamsRowsOldestFirst(t *testing.T) {
	ctx := context.Background()
	db := openActivityTestDB(t)
	store := activity.NewStore(activity.NewSQLiteProvider(db))

	seedReplayRow(t, store, activity.ActionEpisodeAdjusted, "anime-1", "One", 2000, activity.Snapshot{NroCapVisto: 10, Activo: 1}, activity.Snapshot{NroCapVisto: 11, Activo: 1})
	seedReplayRow(t, store, activity.ActionEpisodeAdjusted, "anime-1", "One", 1000, activity.Snapshot{NroCapVisto: 9, Activo: 1}, activity.Snapshot{NroCapVisto: 10, Activo: 1})

	count, err := store.CountReplayable(ctx)
	if err != nil {
		t.Fatalf("count replayable rows: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 replayable rows, got %d", count)
	}

	var streamed []activity.ProgressEvent
	if err := store.StreamOldestFirst(ctx, func(event activity.ProgressEvent) error {
		streamed = append(streamed, event)
		return nil
	}); err != nil {
		t.Fatalf("stream oldest first: %v", err)
	}
	if len(streamed) != 2 {
		t.Fatalf("expected 2 streamed events, got %#v", streamed)
	}
	if streamed[0].OccurredAtMs != 1000 || streamed[1].OccurredAtMs != 2000 {
		t.Fatalf("expected oldest-first order, got %#v", streamed)
	}
	if streamed[0].Before.NroCapVisto != 9 || streamed[0].After.NroCapVisto != 10 {
		t.Fatalf("expected the untagged Snapshot shape decoded, got %#v", streamed[0])
	}
}

// TestStoreDeleteNavigationTelemetryRemovesOnlyNavigationActions proves the
// purge is scoped: an unlisted action_type survives, and the caller
// controls the transaction.
func TestStoreDeleteNavigationTelemetryRemovesOnlyNavigationActions(t *testing.T) {
	ctx := context.Background()
	db := openActivityTestDB(t)
	store := activity.NewStore(activity.NewSQLiteProvider(db))
	seedReplayRow(t, store, activity.ActionEpisodeAdjusted, "anime-1", "One", 1000, activity.Snapshot{}, activity.Snapshot{})
	seedReplayRow(t, store, "anime_page_opened", "anime-1", "One", 2000, activity.Snapshot{}, activity.Snapshot{})

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	deleted, err := store.DeleteNavigationTelemetry(ctx, tx)
	if err != nil {
		t.Fatalf("delete navigation telemetry: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("expected exactly 1 deleted row, got %d", deleted)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit tx: %v", err)
	}

	remaining, err := store.CountReplayable(ctx)
	if err != nil {
		t.Fatalf("count remaining rows: %v", err)
	}
	if remaining != 1 {
		t.Fatalf("expected only the non-navigation row to survive, got %d", remaining)
	}
}

// TestStoreReturnsZeroOnQueryOrExecError proves both error paths' own return
// value, not just error presence: an already-committed transaction fails
// DeleteNavigationTelemetry's exec, and a closed connection fails
// CountReplayable's query; both must report 0 rather than a mutated
// sentinel.
func TestStoreReturnsZeroOnQueryOrExecError(t *testing.T) {
	ctx := context.Background()
	db := openActivityTestDB(t)
	store := activity.NewStore(activity.NewSQLiteProvider(db))

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit tx: %v", err)
	}
	deleted, err := store.DeleteNavigationTelemetry(ctx, tx)
	if err == nil {
		t.Fatal("expected an error executing against an already-committed transaction")
	}
	if deleted != 0 {
		t.Fatalf("expected deleted count 0 on error, got %d", deleted)
	}

	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}
	count, err := store.CountReplayable(ctx)
	if err == nil {
		t.Fatal("expected an error querying a closed database")
	}
	if count != 0 {
		t.Fatalf("expected count 0 on error, got %d", count)
	}
}

// TestRecordActivityFirstWritePrunesUnconditionally proves a freshly
// constructed Store prunes on its very first write rather than waiting for
// PruneEvery, mirroring eventlog's TestNewStoreSeedsPruneCounterFromExistingRows
// -- otherwise a desktop session shorter than PruneEvery writes would never
// prune at all.
func TestRecordActivityFirstWritePrunesUnconditionally(t *testing.T) {
	db := openActivityTestDB(t)
	seedStore := activity.NewStoreWithRetention(activity.NewSQLiteProvider(db), activity.StoreRetention{RowCap: 1000, PruneEvery: 1000})
	for i := range 5 {
		seedReplayRow(t, seedStore, activity.ActionEpisodeAdjusted, "anime-1", "One", int64(1000+i), activity.Snapshot{}, activity.Snapshot{})
	}
	if count := countActivityRows(t, db); count != 5 {
		t.Fatalf("expected 5 seeded rows, got %d", count)
	}

	freshStore := activity.NewStoreWithRetention(activity.NewSQLiteProvider(db), activity.StoreRetention{RowCap: 2, PruneEvery: 100})
	seedReplayRow(t, freshStore, activity.ActionEpisodeAdjusted, "anime-1", "One", 9999, activity.Snapshot{}, activity.Snapshot{})
	if count := countActivityRows(t, db); count != 2 {
		t.Fatalf("expected the first write to prune unconditionally down to cap 2, got %d", count)
	}
}

// TestRecordActivityPrunesOnCadenceNotEveryWrite proves prune fires only on
// the configured write-count cadence after the first write, letting the
// table exceed RowCap between boundaries, mirroring
// eventlog's TestPruneRunsOnlyEveryNthWrite.
func TestRecordActivityPrunesOnCadenceNotEveryWrite(t *testing.T) {
	db := openActivityTestDB(t)
	store := activity.NewStoreWithRetention(activity.NewSQLiteProvider(db), activity.StoreRetention{RowCap: 1, PruneEvery: 3})

	// Write 1 (successful=1) prunes unconditionally; there is only ever one
	// row so far, so there is nothing to remove yet.
	seedReplayRow(t, store, activity.ActionEpisodeAdjusted, "anime-1", "One", 1000, activity.Snapshot{}, activity.Snapshot{})
	if count := countActivityRows(t, db); count != 1 {
		t.Fatalf("expected 1 row after write 1, got %d", count)
	}

	// Write 2 (successful=2) is off-cadence and must NOT prune, letting the
	// table exceed RowCap by one row.
	seedReplayRow(t, store, activity.ActionEpisodeAdjusted, "anime-1", "One", 1001, activity.Snapshot{}, activity.Snapshot{})
	if count := countActivityRows(t, db); count != 2 {
		t.Fatalf("expected write 2 to leave RowCap exceeded by 1, got %d", count)
	}

	// Write 3 (successful=3) hits the cadence boundary and enforces RowCap again.
	seedReplayRow(t, store, activity.ActionEpisodeAdjusted, "anime-1", "One", 1002, activity.Snapshot{}, activity.Snapshot{})
	if count := countActivityRows(t, db); count != 1 {
		t.Fatalf("expected the cadence write to prune down to RowCap 1, got %d", count)
	}
}

// countActivityRows returns the current activity_log row count.
func countActivityRows(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM activity_log`).Scan(&count); err != nil {
		t.Fatalf("count activity_log: %v", err)
	}
	return count
}

// seedReplayRow records one activity row through the public Store API, so no
// test writes activity_log's literal name outside this package.
func seedReplayRow(t *testing.T, store *activity.Store, actionType, animeID, animeName string, occurredAtMs int64, before, after activity.Snapshot) {
	t.Helper()
	beforeJSON, err := json.Marshal(before)
	if err != nil {
		t.Fatalf("marshal before snapshot: %v", err)
	}
	afterJSON, err := json.Marshal(after)
	if err != nil {
		t.Fatalf("marshal after snapshot: %v", err)
	}
	if err := store.RecordActivity(context.Background(), activity.Record{
		Source: activity.SourceDesktop, ActionType: actionType, AnimeID: animeID, AnimeName: animeName,
		OccurredAtMs: occurredAtMs, BeforeJSON: beforeJSON, AfterJSON: afterJSON,
	}); err != nil {
		t.Fatalf("seed replay row: %v", err)
	}
}

// openActivityTestDB opens a temporary bridge database for activity tests.
func openActivityTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// assertTableExists verifies that a named SQLite table exists.
func assertTableExists(t *testing.T, db *sql.DB, table string) {
	t.Helper()
	var name string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name); err != nil {
		t.Fatalf("expected table %s to exist: %v", table, err)
	}
}

// assertIndexExists verifies that a named SQLite index exists.
func assertIndexExists(t *testing.T, db *sql.DB, index string) {
	t.Helper()
	var name string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`, index).Scan(&name); err != nil {
		t.Fatalf("expected index %s to exist: %v", index, err)
	}
}
