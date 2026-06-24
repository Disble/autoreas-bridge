package sync

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSQLiteBootstrapResolveBridgeDBPathCreatesAutoreasDataDir(t *testing.T) {
	t.Parallel()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}

	got, err := bootstrap.ResolveBridgeDBPath()
	if err != nil {
		t.Fatalf("resolve bridge db path: %v", err)
	}

	want := filepath.Join(baseDir, "Autoreas", "data", "bridge.db")
	if got != want {
		t.Fatalf("expected bridge db path %q, got %q", want, got)
	}

	assertDirectoryExists(t, filepath.Dir(got))
}

func TestSQLiteBootstrapResolveBridgeDBPathReturnsUserConfigDirError(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("config dir unavailable")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return "", wantErr
		},
	}

	_, err := bootstrap.ResolveBridgeDBPath()
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected user config dir error %v, got %v", wantErr, err)
	}
}

func TestOpenBridgeDBOpensFileBackedSQLiteDatabase(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Fatalf("ping bridge db: %v", err)
	}

	assertFileExists(t, dbPath)

	if got := queryPragmaString(t, db, "journal_mode"); got != "wal" {
		t.Fatalf("expected journal_mode wal, got %q", got)
	}

	if got := queryPragmaInt(t, db, "busy_timeout"); got != 5000 {
		t.Fatalf("expected busy_timeout 5000, got %d", got)
	}

	if got := db.Stats().MaxOpenConnections; got != 1 {
		t.Fatalf("expected max open connections 1, got %d", got)
	}
}

func TestBootstrapBridgeDBCreatesAnimeSnapshotsTableIdempotently(t *testing.T) {
	t.Parallel()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}

	first, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("first bootstrap bridge db: %v", err)
	}
	defer first.Close()

	if !tableExists(t, first, "anime_snapshots") {
		t.Fatal("expected anime_snapshots table to exist after first bootstrap")
	}

	second, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("second bootstrap bridge db: %v", err)
	}
	defer second.Close()

	if !tableExists(t, second, "anime_snapshots") {
		t.Fatal("expected anime_snapshots table to still exist after second bootstrap")
	}
}

func TestBootstrapBridgeDBCreatesDeviceTables(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	if !tableExists(t, db, "pairing_tokens") {
		t.Fatal("expected pairing_tokens table to exist after bootstrap")
	}

	if !tableExists(t, db, "devices") {
		t.Fatal("expected devices table to exist after bootstrap")
	}
}

func TestBootstrapBridgeDBCreatesDownloadTables(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	for _, table := range []string{
		"download_hoster_priority",
		"download_jd_config",
		"download_schedule_config",
		"download_runs",
	} {
		if !tableExists(t, db, table) {
			t.Fatalf("expected %s table to exist after bootstrap", table)
		}
	}

	hosterPriorityColumns := readTableColumns(t, db, "download_hoster_priority")
	for _, required := range []string{"site", "hoster", "priority", "enabled"} {
		if !containsString(hosterPriorityColumns, required) {
			t.Fatalf("expected download_hoster_priority to contain column %q, got %#v", required, hosterPriorityColumns)
		}
	}

	jdConfigColumns := readTableColumns(t, db, "download_jd_config")
	for _, required := range []string{
		"id", "myjd_email", "myjd_password_encrypted", "device_name",
		"exe_path_override", "default_dest_dir", "last_seen_status",
		"last_seen_at_ms", "last_decrypt_error",
	} {
		if !containsString(jdConfigColumns, required) {
			t.Fatalf("expected download_jd_config to contain column %q, got %#v", required, jdConfigColumns)
		}
	}

	scheduleConfigColumns := readTableColumns(t, db, "download_schedule_config")
	for _, required := range []string{
		"id", "mode", "daily_time_hhmm", "enabled",
		"last_run_at_ms", "last_run_status", "next_run_at_ms",
	} {
		if !containsString(scheduleConfigColumns, required) {
			t.Fatalf("expected download_schedule_config to contain column %q, got %#v", required, scheduleConfigColumns)
		}
	}

	runsColumns := readTableColumns(t, db, "download_runs")
	for _, required := range []string{
		"run_id", "started_at_ms", "finished_at_ms", "trigger",
		"animes_checked", "episodes_found", "episodes_downloaded", "episodes_failed",
		"skipped_count", "jd_available", "status", "error_summary", "manual_links_json",
	} {
		if !containsString(runsColumns, required) {
			t.Fatalf("expected download_runs to contain column %q, got %#v", required, runsColumns)
		}
	}
}

func TestBootstrapBridgeDBIsIdempotentForDownloadTables(t *testing.T) {
	t.Parallel()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	bootstrap := SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}

	first, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("first bootstrap bridge db: %v", err)
	}
	defer first.Close()

	if !tableExists(t, first, "download_hoster_priority") {
		t.Fatal("expected download_hoster_priority table after first bootstrap")
	}

	second, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("second bootstrap bridge db: %v", err)
	}
	defer second.Close()

	if !tableExists(t, second, "download_runs") {
		t.Fatal("expected download_runs table to still exist after second bootstrap")
	}
}

func TestBootstrapBridgeDBSeedsDefaultHosterPriorityWhenEmpty(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	rows, err := db.Query(`SELECT hoster, priority FROM download_hoster_priority WHERE site = 'jkanime' ORDER BY priority ASC`)
	if err != nil {
		t.Fatalf("query seeded hoster priority: %v", err)
	}
	defer rows.Close()

	type seedRow struct {
		hoster   string
		priority int
	}
	var got []seedRow
	for rows.Next() {
		var row seedRow
		if err := rows.Scan(&row.hoster, &row.priority); err != nil {
			t.Fatalf("scan seeded hoster priority row: %v", err)
		}
		got = append(got, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate seeded hoster priority rows: %v", err)
	}

	want := []seedRow{{hoster: "Mediafire", priority: 0}, {hoster: "Mega", priority: 1}}
	if len(got) != len(want) {
		t.Fatalf("expected %d seeded hoster priority rows, got %#v", len(want), got)
	}
	for i, w := range want {
		if got[i] != w {
			t.Fatalf("expected seeded row %d to be %#v, got %#v", i, w, got[i])
		}
	}
}

func TestEnsureDownloadJDConfigSchemaIsIdempotentColumnIntrospection(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	before := readTableColumns(t, db, "download_jd_config")

	if err := ensureDownloadJDConfigSchema(db); err != nil {
		t.Fatalf("ensure download_jd_config schema again: %v", err)
	}

	after := readTableColumns(t, db, "download_jd_config")
	if len(before) != len(after) {
		t.Fatalf("expected column-introspection migration to be idempotent, before=%#v after=%#v", before, after)
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

func TestEnsureAnimeSnapshotsSchemaCreatesFreshTableWithModifiedAt(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	columns := readTableColumns(t, db, "anime_snapshots")
	for _, required := range []string{"anime_id", "snapshot_json", "snapshot_hash", "modified_at"} {
		if !containsString(columns, required) {
			t.Fatalf("expected fresh anime_snapshots to contain column %q, got %#v", required, columns)
		}
	}
}

func TestEnsureAnimeSnapshotsSchemaIsIdempotentWhenAlreadyMigrated(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	before := readTableColumns(t, db, "anime_snapshots")
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("ensure anime_snapshots schema again: %v", err)
	}
	after := readTableColumns(t, db, "anime_snapshots")
	if len(before) != len(after) {
		t.Fatalf("expected column-introspection migration to be idempotent, before=%#v after=%#v", before, after)
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

func TestBootstrapBridgeDBReturnsPathInErrorContext(t *testing.T) {
	t.Parallel()

	bootstrap := SQLiteBootstrap{
		openDB: func(driverName string, dataSourceName string) (*sql.DB, error) {
			return nil, errors.New("boom")
		},
	}

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	_, err := bootstrap.OpenBridgeDB(dbPath)
	if err == nil {
		t.Fatal("expected open bridge db error")
	}

	if !strings.Contains(err.Error(), fmt.Sprintf("%q", dbPath)) {
		t.Fatalf("expected error %q to contain quoted db path %q", err.Error(), dbPath)
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

func assertDirectoryExists(t *testing.T, path string) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat directory %q: %v", path, err)
	}

	if !info.IsDir() {
		t.Fatalf("expected %q to be a directory", path)
	}
}

func assertFileExists(t *testing.T, path string) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat file %q: %v", path, err)
	}

	if info.IsDir() {
		t.Fatalf("expected %q to be a file", path)
	}
}

func queryPragmaString(t *testing.T, db *sql.DB, pragma string) string {
	t.Helper()

	var got string
	if err := db.QueryRow("PRAGMA " + pragma + ";").Scan(&got); err != nil {
		t.Fatalf("query pragma %s: %v", pragma, err)
	}

	return got
}

func queryPragmaInt(t *testing.T, db *sql.DB, pragma string) int {
	t.Helper()

	var got int
	if err := db.QueryRow("PRAGMA " + pragma + ";").Scan(&got); err != nil {
		t.Fatalf("query pragma %s: %v", pragma, err)
	}

	return got
}

func tableExists(t *testing.T, db *sql.DB, tableName string) bool {
	t.Helper()

	var got string
	err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, tableName).Scan(&got)
	if errors.Is(err, sql.ErrNoRows) {
		return false
	}

	if err != nil {
		t.Fatalf("query sqlite_master for table %q: %v", tableName, err)
	}

	return got == tableName
}

func readTableColumns(t *testing.T, db *sql.DB, tableName string) []string {
	t.Helper()
	rows, err := db.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", tableName, err)
	}
	defer rows.Close()
	columns := []string{}
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan pragma table_info(%s): %v", tableName, err)
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate pragma table_info(%s): %v", tableName, err)
	}
	return columns
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
