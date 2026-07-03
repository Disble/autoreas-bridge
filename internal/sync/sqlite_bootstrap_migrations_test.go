package sync

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

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
		legacyDB.Close()
		t.Fatalf("create legacy download_schedule_config schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO download_schedule_config (id, mode, daily_time_hhmm, enabled)
		VALUES (1, 'in_process', '09:00', 1);
	`); err != nil {
		legacyDB.Close()
		t.Fatalf("insert legacy download_schedule_config row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer db.Close()

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
		legacyDB.Close()
		t.Fatalf("create legacy download_runs schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO download_runs (run_id, started_at_ms, trigger, animes_checked, status)
		VALUES ('run-legacy', 100, 'manual', 3, 'ok');
	`); err != nil {
		legacyDB.Close()
		t.Fatalf("insert legacy download_runs row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer db.Close()

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
		legacyDB.Close()
		t.Fatalf("create legacy anime_snapshots schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash)
		VALUES ('anime-1', '{"_id":"anime-1","nombre":"One Piece"}', 'deadbeef');
	`); err != nil {
		legacyDB.Close()
		t.Fatalf("insert legacy anime_snapshots row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer db.Close()

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

func TestEnsureAnimeSnapshotsSchemaRejectsUnsupportedSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	defer db.Close()

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
		legacyDB.Close()
		t.Fatalf("create legacy changelog schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO changelog (anime_id, payload_json, status)
		VALUES ('anime-1', '{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664}', 'pending');
	`); err != nil {
		legacyDB.Close()
		t.Fatalf("insert legacy changelog row: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with migration: %v", err)
	}
	defer db.Close()

	columns := readTableColumns(t, db, "changelog")
	for _, required := range []string{"change_type", "changed_fields_json", "snapshot_json", "changed_at_ms"} {
		if !containsString(columns, required) {
			t.Fatalf("expected migrated changelog schema to contain column %q, got %#v", required, columns)
		}
	}

	var animeID, changeType, changedFieldsJSON, snapshotJSON, status string
	var changedAtMs int64
	if err := db.QueryRow(`SELECT anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms FROM changelog LIMIT 1`).Scan(
		&animeID, &changeType, &changedFieldsJSON, &snapshotJSON, &status, &changedAtMs,
	); err != nil {
		t.Fatalf("query migrated changelog row: %v", err)
	}
	if animeID != "anime-1" {
		t.Fatalf("expected anime_id anime-1, got %q", animeID)
	}
	if changeType == "" || snapshotJSON == "" || changedFieldsJSON == "" || changedAtMs <= 0 {
		t.Fatalf("expected migrated row to populate derived fields, got changeType=%q changedFields=%q snapshot=%q changedAtMs=%d", changeType, changedFieldsJSON, snapshotJSON, changedAtMs)
	}
	if status != "pending" {
		t.Fatalf("expected status pending, got %q", status)
	}
	if changedAtMs > time.Now().UnixMilli() {
		t.Fatalf("expected changed_at_ms to be realistic, got %d", changedAtMs)
	}
}
