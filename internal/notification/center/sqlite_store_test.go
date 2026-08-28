package center

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

// seedNotificationRecords inserts count bare notification_records rows
// directly (bypassing InsertRecord and its prune step), with created_at_ms
// running from startAtMS in steps of 1. Every seeded row is unread and
// active by construction (read_at_ms and archived_at_ms are never set).
func seedNotificationRecords(t *testing.T, db *sql.DB, count int, startAtMS int64) {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	stmt, err := tx.Prepare(`INSERT INTO notification_records (created_at_ms, title, body, level, source) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		t.Fatalf("prepare seed stmt: %v", err)
	}
	defer func() { _ = stmt.Close() }()
	for i := range count {
		if _, err := stmt.Exec(startAtMS+int64(i), "seed", "seed body", "info", "seed"); err != nil {
			t.Fatalf("seed record %d: %v", i, err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit seed tx: %v", err)
	}
}

// notificationRecordExistsAt reports whether a row with the given
// created_at_ms still exists.
func notificationRecordExistsAt(t *testing.T, db *sql.DB, createdAtMS int64) bool {
	t.Helper()
	var exists bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM notification_records WHERE created_at_ms = ?)`, createdAtMS).Scan(&exists); err != nil {
		t.Fatalf("check row existence: %v", err)
	}
	return exists
}

// countNotificationRecords returns how many rows the records table currently
// holds, so retention tests can assert against the cap directly.
func countNotificationRecords(t *testing.T, db *sql.DB) int {
	t.Helper()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM notification_records`).Scan(&count); err != nil {
		t.Fatalf("count notification_records: %v", err)
	}
	return count
}

// TestInsertRecordPersistsRecordAndActions asserts one InsertRecord
// round-trips a Record with 2 Actions.
func TestInsertRecordPersistsRecordAndActions(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})

	record := Record{
		CreatedAtMS: 1000,
		Title:       "Download finished",
		Body:        "One Piece episode 1090 is ready",
		Level:       "success",
		Source:      "download",
		Actions: []Action{
			{ID: "act-1", RowRef: "row-1", Ordinal: 0, Label: "Open folder", Intent: "download.open_folder", Args: map[string]string{"path": "/tmp"}},
			{ID: "act-2", RowRef: "row-1", Ordinal: 1, Label: "Run again", Intent: "download.run_anime", Args: map[string]string{"animeId": "42"}},
		},
	}

	id, err := store.InsertRecord(context.Background(), record)
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	var title, body, level, source string
	var correlationID, rowsJSON sql.NullString
	err = db.QueryRow(`SELECT title, body, level, source, correlation_id, rows_json FROM notification_records WHERE id = ?`, id).
		Scan(&title, &body, &level, &source, &correlationID, &rowsJSON)
	if err != nil {
		t.Fatalf("query inserted record: %v", err)
	}
	if title != record.Title || body != record.Body || level != record.Level || source != record.Source {
		t.Fatalf("unexpected stored record columns: title=%q body=%q level=%q source=%q", title, body, level, source)
	}
	if correlationID.Valid {
		t.Fatal("expected correlation_id to bind NULL when unset")
	}
	if rowsJSON.Valid {
		t.Fatal("expected rows_json to bind NULL when no detail rows are attached")
	}

	rows, err := db.Query(`SELECT id, label, intent FROM notification_record_actions WHERE notification_id = ? ORDER BY ordinal ASC`, id)
	if err != nil {
		t.Fatalf("query inserted actions: %v", err)
	}
	defer func() { _ = rows.Close() }()

	var gotIDs []string
	for rows.Next() {
		var actionID, label, intent string
		if err := rows.Scan(&actionID, &label, &intent); err != nil {
			t.Fatalf("scan action row: %v", err)
		}
		gotIDs = append(gotIDs, actionID)
	}
	if err := rows.Err(); err != nil {
		// Without this the loop would end early on a driver error and the
		// assertion below would blame the row count instead of the query.
		t.Fatalf("iterate action rows: %v", err)
	}
	if len(gotIDs) != 2 || gotIDs[0] != "act-1" || gotIDs[1] != "act-2" {
		t.Fatalf("expected actions [act-1 act-2] in ordinal order, got %#v", gotIDs)
	}
}

// TestPruneOnCapCrossingKeepsExactly2000Rows asserts a write that crosses the
// cap prunes back down to exactly 2000 rows, using the DEFAULT StoreConfig
// (defaultRowCap = 2000). The literal 2000 below is deliberate (CLAUDE.md
// #16): asserting against defaultRowCap would prove nothing about the actual
// contract.
func TestPruneOnCapCrossingKeepsExactly2000Rows(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 2000, 1)
	store := NewStore(db, StoreConfig{})

	if _, err := store.InsertRecord(context.Background(), Record{CreatedAtMS: 5000, Title: "newest", Body: "b", Level: "info", Source: "seed"}); err != nil {
		t.Fatalf("insert record: %v", err)
	}

	if count := countNotificationRecords(t, db); count != 2000 {
		t.Fatalf("expected exactly 2000 rows after prune, got %d", count)
	}
	if notificationRecordExistsAt(t, db, 1) {
		t.Fatal("expected the oldest row to be pruned")
	}
}

// TestPruneRunsOnFirstWriteOfNewProcessRegardlessOfCadence asserts a short
// session still bounds the table across a process restart: a brand new
// Store over a database that already exceeds the cap prunes on its very
// first write, even though that write is nowhere near PruneEvery.
func TestPruneRunsOnFirstWriteOfNewProcessRegardlessOfCadence(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 2500, 1)

	restarted := NewStore(db, StoreConfig{RowCap: 2000, PruneEvery: 50})
	if _, err := restarted.InsertRecord(context.Background(), Record{CreatedAtMS: 9000, Title: "after restart", Body: "b", Level: "info", Source: "seed"}); err != nil {
		t.Fatalf("insert record: %v", err)
	}

	if count := countNotificationRecords(t, db); count > 2000 {
		t.Fatalf("expected the first write of a new process to prune down to the row cap, got %d rows", count)
	}
}

// TestUnreadRowsAreNotPinnedDuringPrune asserts unread rows are not protected
// from pruning.
func TestUnreadRowsAreNotPinnedDuringPrune(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 3, 1) // every seeded row is unread by construction
	store := NewStore(db, StoreConfig{RowCap: 3, PruneEvery: 1})

	if _, err := store.InsertRecord(context.Background(), Record{CreatedAtMS: 4, Title: "t", Body: "b", Level: "info", Source: "seed"}); err != nil {
		t.Fatalf("insert record: %v", err)
	}

	if notificationRecordExistsAt(t, db, 1) {
		t.Fatal("expected the oldest unread row to be pruned; unread rows are not protected")
	}
}

// TestArchivedRowsAreNotPinnedDuringPrune asserts archived rows are not
// protected from pruning.
func TestArchivedRowsAreNotPinnedDuringPrune(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 3, 1)
	if _, err := db.Exec(`UPDATE notification_records SET archived_at_ms = 999 WHERE created_at_ms = 1`); err != nil {
		t.Fatalf("archive oldest row: %v", err)
	}
	store := NewStore(db, StoreConfig{RowCap: 3, PruneEvery: 1})

	if _, err := store.InsertRecord(context.Background(), Record{CreatedAtMS: 4, Title: "t", Body: "b", Level: "info", Source: "seed"}); err != nil {
		t.Fatalf("insert record: %v", err)
	}

	if notificationRecordExistsAt(t, db, 1) {
		t.Fatal("expected the oldest archived row to be pruned; archived rows are not protected")
	}
}

// TestNoRowPrunedOnAgeAloneBelowCap asserts a row far older than any
// freshness window survives when the table is under its row cap.
func TestNoRowPrunedOnAgeAloneBelowCap(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	seedNotificationRecords(t, db, 1, 1) // one ancient row, far under any cap
	store := NewStore(db, StoreConfig{RowCap: 2000, PruneEvery: 50})

	if _, err := store.InsertRecord(context.Background(), Record{CreatedAtMS: time.Now().UnixMilli(), Title: "t", Body: "b", Level: "info", Source: "seed"}); err != nil {
		t.Fatalf("insert record: %v", err)
	}

	if count := countNotificationRecords(t, db); count != 2 {
		t.Fatalf("expected no row pruned on age alone while under the row cap, got %d rows", count)
	}
}

// TestPruneDeletesActionsBeforeRecordsNoOrphans asserts pruning a record
// deletes its actions too -- the only orphan guard, since PRAGMA
// foreign_keys is OFF in this database.
func TestPruneDeletesActionsBeforeRecordsNoOrphans(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{RowCap: 1, PruneEvery: 1})

	doomedID, err := store.InsertRecord(context.Background(), Record{
		CreatedAtMS: 1,
		Title:       "doomed",
		Body:        "b",
		Level:       "info",
		Source:      "seed",
		Actions: []Action{
			{ID: "doomed-act-1", Ordinal: 0, Label: "l", Intent: "i", Args: map[string]string{}},
		},
	})
	if err != nil {
		t.Fatalf("insert doomed record: %v", err)
	}

	if _, err := store.InsertRecord(context.Background(), Record{CreatedAtMS: 2, Title: "survivor", Body: "b", Level: "info", Source: "seed"}); err != nil {
		t.Fatalf("insert survivor record: %v", err)
	}

	var actionCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM notification_record_actions WHERE notification_id = ?`, doomedID).Scan(&actionCount); err != nil {
		t.Fatalf("count orphaned actions: %v", err)
	}
	if actionCount != 0 {
		t.Fatalf("expected the pruned record's actions to be gone, got %d orphaned rows", actionCount)
	}
}
