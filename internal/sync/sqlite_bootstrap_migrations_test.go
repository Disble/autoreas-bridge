package sync

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWriteOperationMigrationCreatesIdempotentSchemaAndIndexes(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	first, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db first time: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close bridge db first time: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("reopen bridge db: %v", err)
	}
	defer closeTestDB(t, db)

	columns := readTableColumns(t, db, "anime_write_operations")
	for _, required := range []string{
		"operation_id", "anime_id", "batch_id", "batch_order", "batch_size", "base_modified_at", "intended_modified_at",
		"base_snapshot_json", "base_hash", "desired_snapshot_json", "desired_hash",
		"status", "created_at_ms", "committed_at_ms",
	} {
		if !containsString(columns, required) {
			t.Fatalf("expected anime_write_operations to contain column %q, got %#v", required, columns)
		}
	}

	indexes := readIndexNames(t, db, "anime_write_operations")
	for _, required := range []string{
		"idx_anime_write_operations_anime_token",
		"idx_anime_write_operations_recovery",
	} {
		if !containsString(indexes, required) {
			t.Fatalf("expected anime_write_operations index %q, got %#v", required, indexes)
		}
	}
}

func TestWriteOperationMigrationCreatesUniqueLiveReservationIndex(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	var sqlText string
	err := db.QueryRow(`
		SELECT sql FROM sqlite_master
		WHERE type = 'index' AND name = 'idx_anime_write_operations_live_reservation'
	`).Scan(&sqlText)
	if err != nil {
		t.Fatalf("query live reservation index: %v", err)
	}
	if !strings.Contains(strings.ToLower(sqlText), "unique") || !strings.Contains(sqlText, "status = 'staged'") {
		t.Fatalf("expected unique staged-only reservation index, got %q", sqlText)
	}
}

// readIndexNames returns SQLite index names for a table.
func readIndexNames(t *testing.T, db *sql.DB, tableName string) []string {
	t.Helper()

	rows, err := db.Query(`PRAGMA index_list(` + tableName + `)`)
	if err != nil {
		t.Fatalf("pragma index_list(%s): %v", tableName, err)
	}
	defer closeTestRows(t, rows)

	indexes := []string{}
	for rows.Next() {
		var sequence, unique, originPartial int
		var name, origin string
		if err := rows.Scan(&sequence, &name, &unique, &origin, &originPartial); err != nil {
			t.Fatalf("scan pragma index_list(%s): %v", tableName, err)
		}
		indexes = append(indexes, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate pragma index_list(%s): %v", tableName, err)
	}
	return indexes
}

func TestOpenBridgeDBMigratesLegacyDownloadScheduleConfigSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE download_schedule_config (
			id              INTEGER PRIMARY KEY CHECK (id = 1),
			mode            TEXT    NOT NULL DEFAULT 'in_process',
			daily_time_hhmm TEXT,
			enabled         INTEGER NOT NULL DEFAULT 0,
			last_run_at_ms  INTEGER,
			last_run_status TEXT,
			next_run_at_ms  INTEGER
		);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("create legacy download_schedule_config schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO download_schedule_config (id, mode, daily_time_hhmm, enabled)
		VALUES (1, 'in_process', '09:00', 1);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("insert legacy download_schedule_config row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer closeTestDB(t, db)

	columns := readTableColumns(t, db, "download_schedule_config")
	if !containsString(columns, "enabled_weekdays") {
		t.Fatalf("expected migrated download_schedule_config schema to contain column %q, got %#v", "enabled_weekdays", columns)
	}

	var dailyTime string
	var enabledWeekdays sql.NullInt64
	if err := db.QueryRow(`SELECT daily_time_hhmm, enabled_weekdays FROM download_schedule_config WHERE id = 1`).Scan(&dailyTime, &enabledWeekdays); err != nil {
		t.Fatalf("query migrated download_schedule_config row: %v", err)
	}
	if dailyTime != "09:00" {
		t.Fatalf("expected pre-existing daily_time_hhmm to be preserved, got %q", dailyTime)
	}
	if enabledWeekdays.Valid {
		t.Fatalf("expected enabled_weekdays to read back NULL for a legacy row, got %v", enabledWeekdays.Int64)
	}
}

func TestOpenBridgeDBMigratesLegacyDownloadRunsSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	// Legacy download_runs schema: everything EXCEPT up_to_date_count.
	if _, err := legacyDB.Exec(`
		CREATE TABLE download_runs (
			run_id              TEXT PRIMARY KEY,
			started_at_ms       INTEGER NOT NULL,
			finished_at_ms      INTEGER,
			trigger             TEXT NOT NULL,
			animes_checked      INTEGER NOT NULL DEFAULT 0,
			episodes_found      INTEGER NOT NULL DEFAULT 0,
			episodes_downloaded INTEGER NOT NULL DEFAULT 0,
			episodes_failed     INTEGER NOT NULL DEFAULT 0,
			skipped_count       INTEGER NOT NULL DEFAULT 0,
			jd_available        INTEGER NOT NULL DEFAULT 0,
			status              TEXT NOT NULL,
			error_summary       TEXT,
			manual_links_json   TEXT
		);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("create legacy download_runs schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO download_runs (run_id, started_at_ms, trigger, animes_checked, status)
		VALUES ('run-legacy', 100, 'manual', 3, 'ok');
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("insert legacy download_runs row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer closeTestDB(t, db)

	columns := readTableColumns(t, db, "download_runs")
	if !containsString(columns, "up_to_date_count") {
		t.Fatalf("expected migrated download_runs schema to contain column %q, got %#v", "up_to_date_count", columns)
	}

	var animesChecked, upToDateCount int
	if err := db.QueryRow(`SELECT animes_checked, up_to_date_count FROM download_runs WHERE run_id = 'run-legacy'`).Scan(&animesChecked, &upToDateCount); err != nil {
		t.Fatalf("query migrated download_runs row: %v", err)
	}
	if animesChecked != 3 {
		t.Fatalf("expected pre-existing animes_checked to be preserved, got %d", animesChecked)
	}
	if upToDateCount != 0 {
		t.Fatalf("expected legacy row to read back up_to_date_count=0, got %d", upToDateCount)
	}
}

func TestOpenBridgeDBMigratesLegacyAnimeSnapshotsSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE anime_snapshots (
			anime_id TEXT PRIMARY KEY,
			snapshot_json TEXT NOT NULL,
			snapshot_hash TEXT NOT NULL
		);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("create legacy anime_snapshots schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash)
		VALUES ('anime-1', '{"id":"anime-1","name":"One Piece"}', 'deadbeef');
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("insert legacy anime_snapshots row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer closeTestDB(t, db)

	columns := readTableColumns(t, db, "anime_snapshots")
	if !containsString(columns, "modified_at") {
		t.Fatalf("expected migrated anime_snapshots schema to contain column %q, got %#v", "modified_at", columns)
	}

	var animeID string
	var modifiedAt int64
	if err := db.QueryRow(`SELECT anime_id, modified_at FROM anime_snapshots WHERE anime_id = 'anime-1'`).Scan(&animeID, &modifiedAt); err != nil {
		t.Fatalf("query migrated anime_snapshots row: %v", err)
	}
	if animeID != "anime-1" {
		t.Fatalf("expected anime_id anime-1, got %q", animeID)
	}
	if modifiedAt != 0 {
		t.Fatalf("expected pre-existing row to read back modified_at=0, got %d", modifiedAt)
	}
}

// TestScheduleDayMigrationPreservesExistingSpanishDiasRows proves the SDD-55 Slice C
// additive schedule-day migration (episode-vocabulary spec scenario "Existing schedule-day
// rows are preserved"): migrating a pre-existing anime_snapshots row never drops or rewrites
// its stored Spanish "dias" values, and only adds the new marker column.
func TestScheduleDayMigrationPreservesExistingSpanishDiasRows(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	const storedSnapshot = `{"id":"anime-1","name":"One Piece","days":[{"day":"Lunes","order":0}]}`
	if _, err := legacyDB.Exec(`
		CREATE TABLE anime_snapshots (
			anime_id TEXT PRIMARY KEY,
			snapshot_json TEXT NOT NULL,
			snapshot_hash TEXT NOT NULL,
			modified_at INTEGER NOT NULL DEFAULT 0
		);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("create pre-Slice-C anime_snapshots schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at)
		VALUES ('anime-1', ?, 'deadbeef', 0);
	`, storedSnapshot); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("insert pre-Slice-C anime_snapshots row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with schedule-day migration: %v", err)
	}
	defer closeTestDB(t, db)

	columns := readTableColumns(t, db, "anime_snapshots")
	if !containsString(columns, "schedule_day_migrated_at") {
		t.Fatalf("expected migrated anime_snapshots schema to contain column %q, got %#v", "schedule_day_migrated_at", columns)
	}

	var snapshotJSON string
	if err := db.QueryRow(`SELECT snapshot_json FROM anime_snapshots WHERE anime_id = 'anime-1'`).Scan(&snapshotJSON); err != nil {
		t.Fatalf("query migrated anime_snapshots row: %v", err)
	}
	if snapshotJSON != storedSnapshot {
		t.Fatalf("expected stored Spanish dias snapshot preserved unchanged, got %q", snapshotJSON)
	}
}

// TestScheduleDayMigrationRerunIsNoOp proves the SDD-55 Slice C migration re-run scenario:
// running the migration again on an already-migrated database detects the column is present
// and skips re-applying it without error.
func TestScheduleDayMigrationRerunIsNoOp(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	before := readTableColumns(t, db, "anime_snapshots")
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("re-run schedule-day migration: %v", err)
	}
	after := readTableColumns(t, db, "anime_snapshots")
	if len(before) != len(after) {
		t.Fatalf("expected schedule-day migration re-run to be a no-op, before=%#v after=%#v", before, after)
	}
}

func TestEnsureAnimeSnapshotsSchemaRejectsUnsupportedSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	defer closeTestDB(t, db)

	if _, err := db.Exec(`CREATE TABLE anime_snapshots (anime_id TEXT PRIMARY KEY, unexpected_column TEXT)`); err != nil {
		t.Fatalf("create unsupported anime_snapshots schema: %v", err)
	}
	if err := ensureAnimeSnapshotsSchema(db); err == nil {
		t.Fatal("expected ensureAnimeSnapshotsSchema to reject unsupported schema columns")
	}
}

func TestOpenBridgeDBMigratesLegacyChangelogSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE changelog (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			anime_id TEXT NOT NULL,
			payload_json TEXT,
			status TEXT NOT NULL
		);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("create legacy changelog schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO changelog (anime_id, payload_json, status)
		VALUES ('anime-1', '{"id":"anime-1","name":"One Piece","episodesWatched":664}', 'pending');
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("insert legacy changelog row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	assertMigratedLegacyChangelog(t, dbPath)
}

// assertMigratedLegacyChangelog verifies the rebuilt legacy changelog.
func assertMigratedLegacyChangelog(t *testing.T, dbPath string) {
	t.Helper()
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer closeTestDB(t, db)
	for _, required := range []string{"change_type", "changed_fields_json", "snapshot_json", "changed_at_ms"} {
		if !containsString(readTableColumns(t, db, "changelog"), required) {
			t.Fatalf("missing migrated column %q", required)
		}
	}
	var animeID, changeType, fields, snapshot, status string
	var changedAt int64
	if err := db.QueryRow(`SELECT anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms FROM changelog LIMIT 1`).Scan(&animeID, &changeType, &fields, &snapshot, &status, &changedAt); err != nil {
		t.Fatalf("query migrated changelog row: %v", err)
	}
	if animeID != "anime-1" || changeType == "" || fields == "" || snapshot == "" || status != "pending" || changedAt <= 0 || changedAt > time.Now().UnixMilli() {
		t.Fatalf("unexpected migrated changelog row")
	}
}
