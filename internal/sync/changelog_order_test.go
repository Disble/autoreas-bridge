package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	stdsync "sync"
	"testing"
)

// Installed Mobile builds diff a whole snapshot when a row's changed fields are unknown to them, and
// drop a row whose timestamp is not above the last one they applied for that anime. So for one anime,
// a later row (higher id) must carry a higher timestamp and a snapshot no older than an earlier row's.

// storeSnapshot writes the current snapshot of anime id at version, as a committed write does.
func storeSnapshot(t *testing.T, db *sql.DB, id string, version int) {
	t.Helper()

	seedAnimeSnapshot(t, db, id, string(snapshotAt(id, version)))
}

// seedAnimeSnapshot stores snapshot as the current snapshot of anime id.
func seedAnimeSnapshot(t *testing.T, db *sql.DB, id, snapshot string) {
	t.Helper()

	if err := upsertAnimeSnapshot(context.Background(), db, id, snapshot); err != nil {
		t.Fatalf("store snapshot of %s: %v", id, err)
	}
}

// upsertAnimeSnapshot stores snapshot as the current snapshot of anime id.
func upsertAnimeSnapshot(ctx context.Context, db *sql.DB, id, snapshot string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash) VALUES (?, ?, '')
		ON CONFLICT(anime_id) DO UPDATE SET snapshot_json = excluded.snapshot_json`, id, snapshot)
	return err
}

// snapshotAt is the stored snapshot of anime id at watched progress version; the name is unique
// per anime, as the store requires.
func snapshotAt(id string, version int) []byte {
	return fmt.Appendf(nil, `{"id":%q,"name":"Order %s","episodesWatched":%d}`, id, id, version)
}

// orderedRow is one stored changelog row reduced to what the ordering invariant reads.
type orderedRow struct {
	id      int64
	ts      int64
	version int
	fields  string
}

// rowsOf returns the stored changelog rows of anime id in id order.
func rowsOf(t *testing.T, db *sql.DB, id string) []orderedRow {
	t.Helper()

	result, err := db.Query(`SELECT id, changed_at_ms, snapshot_json, changed_fields_json FROM changelog WHERE anime_id = ? ORDER BY id`, id)
	if err != nil {
		t.Fatalf("query rows: %v", err)
	}
	defer func() { _ = result.Close() }()
	var rows []orderedRow
	for result.Next() {
		var row orderedRow
		var snapshot string
		if err := result.Scan(&row.id, &row.ts, &snapshot, &row.fields); err != nil {
			t.Fatalf("scan row: %v", err)
		}
		var decoded struct {
			EpisodesWatched int `json:"episodesWatched"`
		}
		if err := json.Unmarshal([]byte(snapshot), &decoded); err != nil {
			t.Fatalf("decode snapshot %q: %v", snapshot, err)
		}
		row.version = decoded.EpisodesWatched
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		t.Fatalf("iterate rows: %v", err)
	}
	return rows
}

// assertOrdered checks the invariant over every pair of consecutive rows of anime id.
func assertOrdered(t *testing.T, db *sql.DB, id string) []orderedRow {
	t.Helper()

	rows := rowsOf(t, db, id)
	for i := 1; i < len(rows); i++ {
		if rows[i].ts <= rows[i-1].ts {
			t.Errorf("row %d has timestamp %d, not above row %d's %d", rows[i].id, rows[i].ts, rows[i-1].id, rows[i-1].ts)
		}
		if rows[i].version < rows[i-1].version {
			t.Errorf("row %d carries snapshot version %d, older than row %d's %d", rows[i].id, rows[i].version, rows[i-1].id, rows[i-1].version)
		}
	}
	return rows
}

// TestAnEpisodesRowReadBeforeAPatchCannotRevertIt is Mobile's sequence: the duration announcement
// read the anime before the Editor patch committed, and its row is stored after the patch's row.
func TestAnEpisodesRowReadBeforeAPatchCannotRevertIt(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	storeSnapshot(t, db, "a", 7)
	staleRead := snapshotAt("a", 7)
	storeSnapshot(t, db, "a", 8)

	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangeType: ChangelogTypeUpdate,
		ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("a", 8), ChangedAtMs: 500}))
	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangeType: ChangelogTypeUpdate,
		ChangedFields: []string{"episodes"}, SnapshotJSON: staleRead, ChangedAtMs: 500}))

	rows := assertOrdered(t, db, "a")
	if len(rows) != 2 || rows[1].version != 8 || rows[1].fields != `["episodes"]` {
		t.Fatalf("want the episodes row to carry the patched anime and keep its fields, got %+v", rows)
	}
}

// TestAPatchRowStoredAfterAnEpisodesRowCannotRevertIt is the reverse order: a patch event carrying
// version 8 is stored after an episodes row that already read a later write (version 9).
func TestAPatchRowStoredAfterAnEpisodesRowCannotRevertIt(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	storeSnapshot(t, db, "a", 9)

	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangeType: ChangelogTypeUpdate,
		ChangedFields: []string{"episodes"}, SnapshotJSON: snapshotAt("a", 9), ChangedAtMs: 700}))
	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangeType: ChangelogTypeUpdate,
		ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("a", 8), ChangedAtMs: 650}))

	rows := assertOrdered(t, db, "a")
	if len(rows) != 2 || rows[1].version != 9 || rows[1].ts != 701 || rows[1].fields != `["episodesWatched"]` {
		t.Fatalf("want the patch row to carry the current anime one millisecond later, got %+v", rows)
	}
}

// TestTimestampsAreStrictlyIncreasingPerAnimeOnly proves the clock is raised only past the same
// anime's last row: ties and a clock that went back move up by one, another anime is untouched.
func TestTimestampsAreStrictlyIncreasingPerAnimeOnly(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	storeSnapshot(t, db, "a", 1)
	storeSnapshot(t, db, "b", 1)

	for _, entry := range []ChangelogEntry{
		{AnimeID: "a", ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 100},
		{AnimeID: "a", ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 100},
		{AnimeID: "a", ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 40},
		{AnimeID: "b", ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("b", 1), ChangedAtMs: 40},
		{AnimeID: "a", ChangedFields: []string{"episodesWatched"}, SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 900},
	} {
		must(t, store.InsertPending(ctx, entry))
	}

	var got []int64
	for _, row := range rowsOf(t, db, "a") {
		got = append(got, row.ts)
	}
	if fmt.Sprint(got) != "[100 101 102 900]" {
		t.Errorf("want a's timestamps [100 101 102 900], got %v", got)
	}
	if rows := rowsOf(t, db, "b"); len(rows) != 1 || rows[0].ts != 40 {
		t.Errorf("another anime's row keeps its own clock, got %+v", rows)
	}

	storeSnapshot(t, db, "c", 1)
	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "c", ChangedFields: []string{"episodesWatched"},
		SnapshotJSON: snapshotAt("c", 1), ChangedAtMs: 0}))
	if rows := rowsOf(t, db, "c"); len(rows) != 1 || rows[0].ts != 0 {
		t.Errorf("an anime's first row has nothing to pass and keeps its clock, got %+v", rows)
	}
}

// TestAFailedSnapshotReadStoresNothingAndReportsIt keeps a broken read from passing as a vanished
// anime: the row is not silently dropped, the caller gets the error.
func TestAFailedSnapshotReadStoresNothingAndReportsIt(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	if _, err := db.Exec(`DROP TABLE anime_snapshots`); err != nil {
		t.Fatalf("drop snapshots: %v", err)
	}

	err := store.InsertPending(context.Background(), ChangelogEntry{AnimeID: "a", ChangedFields: []string{"episodesWatched"},
		SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 10})

	if err == nil {
		t.Fatal("a failed snapshot read must be reported, got nil")
	}
	if rows := rowsOf(t, db, "a"); len(rows) != 0 {
		t.Fatalf("a failed read stores nothing, got %+v", rows)
	}
}

// TestARowOfAVanishedAnimeIsNotStoredUnlessItIsADelete keeps a late update from resurrecting an
// anime on installed phones: only a delete row may outlive its anime, with the event's snapshot.
func TestARowOfAVanishedAnimeIsNotStoredUnlessItIsADelete(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()

	for _, changeType := range []string{ChangelogTypeUpdate, ChangelogTypeCreate} {
		must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "gone", ChangeType: changeType,
			SnapshotJSON: snapshotAt("gone", 3), ChangedAtMs: 10}))
	}
	if rows := rowsOf(t, db, "gone"); len(rows) != 0 {
		t.Fatalf("an update or create of a missing anime must store nothing, got %+v", rows)
	}

	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "gone", ChangeType: ChangelogTypeDelete,
		SnapshotJSON: snapshotAt("gone", 3), ChangedAtMs: 10}))
	if rows := rowsOf(t, db, "gone"); len(rows) != 1 || rows[0].version != 3 {
		t.Fatalf("a delete row keeps the event snapshot, got %+v", rows)
	}
}

// TestARowWithoutChangedFieldsIsNotStored keeps the contract that every update names what changed:
// a write that changed no field is nothing a phone can apply. A delete names no field by nature.
func TestARowWithoutChangedFieldsIsNotStored(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	storeSnapshot(t, db, "a", 1)

	for _, fields := range [][]string{nil, {}} {
		for _, changeType := range []string{ChangelogTypeUpdate, ChangelogTypeCreate} {
			must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangeType: changeType, ChangedFields: fields,
				SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 10}))
		}
	}
	if rows := rowsOf(t, db, "a"); len(rows) != 0 {
		t.Fatalf("a row without changed fields must not be stored, got %+v", rows)
	}

	must(t, store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangeType: ChangelogTypeDelete, SnapshotJSON: snapshotAt("a", 1), ChangedAtMs: 10}))
	if rows := rowsOf(t, db, "a"); len(rows) != 1 || rows[0].fields != "[]" {
		t.Fatalf("a delete row is stored without fields, got %+v", rows)
	}
}

// TestConcurrentWritersKeepEveryAnimesRowsOrdered races committed writes against rows carrying stale
// snapshots and equal clocks, then checks the invariant over every pair of rows.
func TestConcurrentWritersKeepEveryAnimesRowsOrdered(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewChangelogStore(NewSQLiteProvider(db))
	ctx := context.Background()
	storeSnapshot(t, db, "a", 0)

	var wg stdsync.WaitGroup
	errs := make(chan error, 40)
	for range 4 {
		wg.Go(func() {
			if err := writeThenRecordStale(ctx, db, store, 10); err != nil {
				errs <- err
			}
		})
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("writer: %v", err)
	}

	rows := assertOrdered(t, db, "a")
	if len(rows) != 40 {
		t.Fatalf("want 40 rows, got %d", len(rows))
	}
	for _, row := range rows {
		if row.version == 0 {
			t.Fatalf("no row may carry the stale event snapshot, got %+v", row)
		}
	}
}

// writeThenRecordStale commits times a write that raises anime a's version atomically, so a higher
// version is a later write, and records each with a stale event payload and a shared clock that the
// store must not trust.
func writeThenRecordStale(ctx context.Context, db *sql.DB, store *ChangelogStore, times int) error {
	for range times {
		if _, err := db.ExecContext(ctx, `UPDATE anime_snapshots SET snapshot_json = json_set(snapshot_json, '$.episodesWatched',
			json_extract(snapshot_json, '$.episodesWatched') + 1) WHERE anime_id = 'a'`); err != nil {
			return err
		}
		if err := store.InsertPending(ctx, ChangelogEntry{AnimeID: "a", ChangedFields: []string{"episodesWatched"},
			SnapshotJSON: snapshotAt("a", 0), ChangedAtMs: 1}); err != nil {
			return err
		}
	}
	return nil
}

// insertWithAnime stores entry's snapshot as its anime's current one, as the committed write behind
// the row would have, then inserts the row. A delete row seeds nothing.
func insertWithAnime(ctx context.Context, db *sql.DB, store *ChangelogStore, entry ChangelogEntry) error {
	if entry.ChangeType != ChangelogTypeDelete {
		if err := upsertAnimeSnapshot(ctx, db, entry.AnimeID, string(entry.SnapshotJSON)); err != nil {
			return err
		}
	}
	return store.InsertPending(ctx, entry)
}

// must fails the test on err.
func must(t *testing.T, err error) {
	t.Helper()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
