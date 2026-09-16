package watchhistory

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
)

// watchHistoryAnimeIDs returns every anime_id currently in watch_history, in
// id order, for asserting a full-refresh import replaced -- or a failed
// import left completely untouched -- the table's rows.
func watchHistoryAnimeIDs(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`SELECT anime_id FROM watch_history ORDER BY id`)
	if err != nil {
		t.Fatalf("query watch_history anime_ids: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan anime_id: %v", err)
		}
		ids = append(ids, id)
	}
	return ids
}

func TestValidateWatchHistoryRejectsMalformedLine(t *testing.T) {
	validateFn := ValidateWatchHistory()
	if _, err := validateFn(context.Background(), strings.NewReader("not json\n")); err == nil {
		t.Fatal("expected validation to reject a malformed JSONL line")
	}
}

// TestValidateWatchHistoryRejectsInvalidRecords tables the minimal-invariant
// rejections ValidateWatchHistory enforces: each case shares the same act
// (marshal one record, validate it) and assert (an error), varying only the
// record's invalid field.
func TestValidateWatchHistoryRejectsInvalidRecords(t *testing.T) {
	validRecord := watchHistoryRecord{ID: 1, AnimeID: "a", AnimeName: "n", Episode: 1, Cycle: 1, WatchedAtMS: 1, Source: "desktop"}

	cases := []struct {
		name string
		rec  watchHistoryRecord
	}{
		{name: "empty anime_id", rec: func() watchHistoryRecord { r := validRecord; r.AnimeID = ""; return r }()},
		{name: "zero id", rec: func() watchHistoryRecord { r := validRecord; r.ID = 0; return r }()},
		{name: "negative id", rec: func() watchHistoryRecord { r := validRecord; r.ID = -1; return r }()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := json.Marshal(tc.rec)
			if err != nil {
				t.Fatalf("marshal fixture: %v", err)
			}
			validateFn := ValidateWatchHistory()
			if _, err := validateFn(context.Background(), bytes.NewReader(raw)); err == nil {
				t.Fatalf("expected validation to reject a record with %s", tc.name)
			}
		})
	}
}

func TestValidateWatchHistoryReportsTheCountItRead(t *testing.T) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for i := range 3 {
		rec := watchHistoryRecord{ID: int64(i + 1), AnimeID: "a", AnimeName: "n", Episode: int64(i + 1), Cycle: 1, WatchedAtMS: int64(i), Source: "desktop"}
		if err := enc.Encode(rec); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}

	validateFn := ValidateWatchHistory()
	count, err := validateFn(context.Background(), &buf)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected count 3, got %d", count)
	}
}

// TestImportWatchHistoryPropagatesSetupErrors tables the three ways
// ImportWatchHistory's transactional setup can fail before any record is
// decoded -- BeginTx, the full-refresh DELETE, and preparing the insert --
// each sharing the same act (call the import function) and assert (a
// non-nil error and a reported count of exactly 0).
func TestImportWatchHistoryPropagatesSetupErrors(t *testing.T) {
	cases := []struct {
		name       string
		breakSetup func(t *testing.T, db *sql.DB)
	}{
		{
			name: "BeginTx fails on a closed database",
			breakSetup: func(t *testing.T, db *sql.DB) {
				t.Helper()
				if err := db.Close(); err != nil {
					t.Fatalf("close test db: %v", err)
				}
			},
		},
		{
			name: "the full-refresh DELETE fails when the table is gone",
			breakSetup: func(t *testing.T, db *sql.DB) {
				t.Helper()
				if _, err := db.Exec(`DROP TABLE watch_history`); err != nil {
					t.Fatalf("drop watch_history: %v", err)
				}
			},
		},
		{
			name: "preparing the insert fails when a named column is gone",
			breakSetup: func(t *testing.T, db *sql.DB) {
				t.Helper()
				// DELETE FROM watch_history names no column, so it still
				// succeeds against the renamed schema; only the INSERT's
				// explicit column list fails to prepare.
				if _, err := db.Exec(`ALTER TABLE watch_history RENAME COLUMN source_activity_id TO renamed_away`); err != nil {
					t.Fatalf("rename watch_history column: %v", err)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertImportSetupFails(t, tc.breakSetup)
		})
	}
}

// assertImportSetupFails breaks a fresh database with breakSetup, imports
// one valid record, and requires an error with a reported count of exactly
// 0. Kept out of the table loop so its branches sit at gocognit level 0.
func assertImportSetupFails(t *testing.T, breakSetup func(t *testing.T, db *sql.DB)) {
	t.Helper()

	db := openStoreTestDB(t)
	breakSetup(t, db)

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(watchHistoryRecord{ID: 1, AnimeID: "a", AnimeName: "n", Episode: 1, Cycle: 1, WatchedAtMS: 1, Source: "desktop"}); err != nil {
		t.Fatalf("encode fixture: %v", err)
	}

	count, err := ImportWatchHistory(db)(context.Background(), &buf)
	if err == nil {
		t.Fatal("expected import to fail")
	}
	if count != 0 {
		t.Fatalf("expected a setup failure to report count 0, got %d", count)
	}
}

func TestImportWatchHistoryReplacesExistingRows(t *testing.T) {
	db := openStoreTestDB(t)
	if _, err := db.ExecContext(context.Background(), `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES ('old-anime', 'Old Anime', 1, 1, 1, 'desktop', NULL)
	`); err != nil {
		t.Fatalf("seed pre-import row: %v", err)
	}

	var buf bytes.Buffer
	rec := watchHistoryRecord{ID: 1, AnimeID: "new-anime", AnimeName: "New Anime", Episode: 1, Cycle: 1, WatchedAtMS: 2, Source: "desktop"}
	if err := json.NewEncoder(&buf).Encode(rec); err != nil {
		t.Fatalf("encode fixture: %v", err)
	}

	count, err := ImportWatchHistory(db)(context.Background(), &buf)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	ids := watchHistoryAnimeIDs(t, db)
	if len(ids) != 1 || ids[0] != "new-anime" {
		t.Fatalf("expected exactly [new-anime] after full refresh, got %v", ids)
	}
}

// TestImportWatchHistoryFailingRecordRollsBackTheWholeGroup proves the
// DELETE+INSERT full refresh runs inside one transaction: a decode failure
// partway through the stream must leave the pre-import row untouched, not a
// half-applied mix of the old row deleted and only some new rows inserted.
func TestImportWatchHistoryFailingRecordRollsBackTheWholeGroup(t *testing.T) {
	db := openStoreTestDB(t)
	if _, err := db.ExecContext(context.Background(), `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES ('old-anime', 'Old Anime', 1, 1, 1, 'desktop', NULL)
	`); err != nil {
		t.Fatalf("seed pre-import row: %v", err)
	}

	validLine, err := json.Marshal(watchHistoryRecord{ID: 1, AnimeID: "new-anime", AnimeName: "New Anime", Episode: 1, Cycle: 1, WatchedAtMS: 2, Source: "desktop"})
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	stream := string(validLine) + "\nnot json\n"

	if _, err := ImportWatchHistory(db)(context.Background(), strings.NewReader(stream)); err == nil {
		t.Fatal("expected the import to fail on the malformed second record")
	}

	ids := watchHistoryAnimeIDs(t, db)
	if len(ids) != 1 || ids[0] != "old-anime" {
		t.Fatalf("expected the failed import to roll back entirely, leaving only [old-anime], got %v", ids)
	}
}

func TestImportWatchHistoryRoundTripsEveryColumnIncludingNullSourceActivityID(t *testing.T) {
	srcDB := openStoreTestDB(t)
	if _, err := srcDB.ExecContext(context.Background(), `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES ('anime-1', 'Anime One', 5, 2, 12345, 'mobile', NULL)
	`); err != nil {
		t.Fatalf("seed anime-1: %v", err)
	}
	if _, err := srcDB.ExecContext(context.Background(), `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES ('anime-2', 'Anime Two', 1, 1, 999, 'backfill', 77)
	`); err != nil {
		t.Fatalf("seed anime-2: %v", err)
	}

	var buf bytes.Buffer
	if _, err := ExportWatchHistory(srcDB)(context.Background(), &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	dstDB := openStoreTestDB(t)
	count, err := ImportWatchHistory(dstDB)(context.Background(), &buf)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected count 2, got %d", count)
	}

	var nullSource sql.NullInt64
	if err := dstDB.QueryRow(`SELECT source_activity_id FROM watch_history WHERE anime_id = 'anime-1'`).Scan(&nullSource); err != nil {
		t.Fatalf("query anime-1: %v", err)
	}
	if nullSource.Valid {
		t.Fatalf("expected anime-1's source_activity_id to remain NULL, got %v", nullSource.Int64)
	}

	var setSource sql.NullInt64
	if err := dstDB.QueryRow(`SELECT source_activity_id FROM watch_history WHERE anime_id = 'anime-2'`).Scan(&setSource); err != nil {
		t.Fatalf("query anime-2: %v", err)
	}
	if !setSource.Valid || setSource.Int64 != 77 {
		t.Fatalf("expected anime-2's source_activity_id to round-trip as 77, got %+v", setSource)
	}
}

// TestImportWatchHistoryThenLiveWriteNeverCollides proves the explicit-id
// insert this importer relies on does not desync AUTOINCREMENT's next id:
// after importing a row carrying a high explicit id, a real live write
// through Store must succeed with no primary-key conflict, landing on an id
// past the imported one.
func TestImportWatchHistoryThenLiveWriteNeverCollides(t *testing.T) {
	db := openStoreTestDB(t)

	var buf bytes.Buffer
	rec := watchHistoryRecord{ID: 500, AnimeID: "anime-1", AnimeName: "Anime One", Episode: 1, Cycle: 1, WatchedAtMS: 100, Source: "desktop"}
	if err := json.NewEncoder(&buf).Encode(rec); err != nil {
		t.Fatalf("encode fixture: %v", err)
	}
	if _, err := ImportWatchHistory(db)(context.Background(), &buf); err != nil {
		t.Fatalf("import: %v", err)
	}

	store := NewStore(db)
	if err := store.Apply(context.Background(), Change{
		AnimeID: "anime-2", AnimeName: "Anime Two", Source: "desktop",
		OccurredAtMS: 200, BeforeEpisodes: 0, AfterEpisodes: 1, Cycle: 1,
	}); err != nil {
		t.Fatalf("expected the live write after import to succeed with no id collision: %v", err)
	}

	var newID int64
	if err := db.QueryRow(`SELECT id FROM watch_history WHERE anime_id = 'anime-2'`).Scan(&newID); err != nil {
		t.Fatalf("query new row id: %v", err)
	}
	if newID <= 500 {
		t.Fatalf("expected the new row's id to exceed the imported id 500, got %d", newID)
	}
}
