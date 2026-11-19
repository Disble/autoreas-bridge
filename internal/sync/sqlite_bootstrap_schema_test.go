package sync

import (
	"database/sql"
	"path/filepath"
	"slices"
	"testing"
)

// freshSchemaColumns names, per table, the columns a fresh bootstrap must create.
var freshSchemaColumns = map[string][]string{
	"pairing_tokens":           nil,
	"devices":                  nil,
	"changelog":                nil,
	"device_sync_state":        nil,
	"device_telemetry_events":  nil,
	"request_capture_metadata": nil,
	"download_hoster_priority": {"site", "hoster", "priority", "enabled"},
	"download_jd_config": {
		"id", "myjd_email", "myjd_password_encrypted", "device_name",
		"exe_path_override", "default_dest_dir", "last_seen_status",
		"last_seen_at_ms", "last_decrypt_error",
	},
	"download_schedule_config": {
		"id", "mode", "daily_time_hhmm", "enabled",
		"last_run_at_ms", "last_run_status", "next_run_at_ms", "enabled_weekdays",
	},
	"download_runs": {
		"run_id", "started_at_ms", "finished_at_ms", "trigger",
		"animes_checked", "episodes_found", "episodes_downloaded", "episodes_failed",
		"skipped_count", "up_to_date_count", "jd_available", "status", "error_summary", "manual_links_json",
	},
	"anime_snapshots": {"anime_id", "snapshot_json", "snapshot_hash", "modified_at"},
	"request_captures": {
		"request_id", "captured_at_ms", "kind", "route", "transport", "device_id", "device_name", "outcome",
		"anime_id", "http_status", "payload_json", "correlation_json", "error_code",
		"request_body", "request_body_state", "response_body", "response_body_state", "request_headers",
		"response_headers", "duration_ms", "error_message", "client_request_id", "response_hash",
	},
	"runtime_events": {
		"id", "occurred_at_ms", "domain", "level", "message",
		"correlation_id", "entity_id", "event_type", "duration_ms", "metadata_json",
	},
}

// exactSchemaColumns names tables whose column set must match exactly.
var exactSchemaColumns = map[string][]string{
	"request_rollup_hourly": {"hour_ms", "route_template", "status_class", "device_id", "request_count", "max_duration_ms"},
	"response_versions":     {"route_template", "body_hash", "body", "first_seen_ms", "last_seen_ms", "seen_count"},
}

// freshSchemaIndexes names the indexes a fresh bootstrap must create.
var freshSchemaIndexes = []string{
	"idx_request_captures_route_time", "idx_request_captures_status_time", "idx_request_captures_client_id",
	"idx_runtime_events_time", "idx_runtime_events_correlation", "idx_runtime_events_domain_level",
}

// TestAFreshBridgeDBHoldsTheWholeSchemaAndReEnsuringChangesNothing opens one
// file-backed database, checks its connection settings, every table, column,
// index, seed and retired table, then re-runs the column migrations over it.
func TestAFreshBridgeDBHoldsTheWholeSchemaAndReEnsuringChangesNothing(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer closeTestDB(t, db)

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

	assertFreshSchema(t, db)
	assertNoRetiredWriteSchema(t, db)
	for _, table := range []string{retiredDiagnosticsTable, "mobile_request_captures", "mobile_request_capture_metadata"} {
		if tableExists(t, db, table) {
			t.Fatalf("expected retired table %q to never be created on a fresh install", table)
		}
	}

	var version string
	if err := db.QueryRow(`SELECT value FROM request_capture_metadata WHERE key = 'request_capture_schema_version'`).Scan(&version); err != nil {
		t.Fatalf("read capture schema version: %v", err)
	}
	if version != "5" {
		t.Fatalf("expected capture schema version 5, got %q", version)
	}

	want := []hosterPriorityRow{
		{hoster: "Mediafire", priority: 0},
		{hoster: "Mega", priority: 1},
		{hoster: "Vidhide", priority: 2},
		{hoster: "Mp4upload", priority: 3},
		{hoster: "Mixdrop", priority: 4},
	}
	if got := readHosterPriorityRowsForSite(t, db, "jkanime"); !slices.Equal(got, want) {
		t.Fatalf("expected seeded hoster priority rows %#v, got %#v", want, got)
	}

	assertReEnsuringKeepsColumns(t, db)
}

// assertFreshSchema checks every table, column and index of a fresh bootstrap.
func assertFreshSchema(t *testing.T, db *sql.DB) {
	t.Helper()

	for table, required := range freshSchemaColumns {
		if !tableExists(t, db, table) {
			t.Fatalf("expected %s table to exist after bootstrap", table)
		}
		assertTableHasColumns(t, db, table, required)
	}
	for table, required := range exactSchemaColumns {
		if columns := readTableColumns(t, db, table); len(columns) != len(required) {
			t.Fatalf("expected %s columns %#v, got %#v", table, required, columns)
		}
		assertTableHasColumns(t, db, table, required)
	}
	for _, index := range freshSchemaIndexes {
		var name string
		if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`, index).Scan(&name); err != nil {
			t.Fatalf("expected index %q to exist: %v", index, err)
		}
	}
}

// assertReEnsuringKeepsColumns re-runs each column-introspection migration over
// an already migrated database and fails when a column count changes.
func assertReEnsuringKeepsColumns(t *testing.T, db *sql.DB) {
	t.Helper()

	for table, ensure := range map[string]func(*sql.DB) error{
		"download_jd_config":       ensureDownloadJDConfigSchema,
		"download_schedule_config": ensureDownloadScheduleConfigSchema,
		"anime_snapshots":          ensureAnimeSnapshotsSchema,
	} {
		before := readTableColumns(t, db, table)
		if err := ensure(db); err != nil {
			t.Fatalf("ensure %s schema again: %v", table, err)
		}
		if after := readTableColumns(t, db, table); len(before) != len(after) {
			t.Fatalf("expected the %s column migration to be idempotent, before=%#v after=%#v", table, before, after)
		}
	}
}

// assertTableHasColumns fails when table lacks any of the required columns.
func assertTableHasColumns(t *testing.T, db *sql.DB, table string, required []string) {
	t.Helper()

	columns := readTableColumns(t, db, table)
	for _, column := range required {
		if !containsString(columns, column) {
			t.Fatalf("expected %s to contain column %q, got %#v", table, column, columns)
		}
	}
}

// TestASecondBootstrapOverTheSameDataDirKeepsTheSchema bootstraps one data
// directory twice and checks the second handle still holds every table and the
// same capture columns.
func TestASecondBootstrapOverTheSameDataDirKeepsTheSchema(t *testing.T) {
	t.Parallel()

	bootstrap := newTestBootstrap(t)
	first, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("first bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, first)
	tables := []string{"anime_snapshots", "download_hoster_priority", "download_runs", "runtime_events"}
	for _, table := range tables {
		if !tableExists(t, first, table) {
			t.Fatalf("expected %s table after first bootstrap", table)
		}
	}
	before := readTableColumns(t, first, "request_captures")

	second, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("second bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, second)
	for _, table := range tables {
		if !tableExists(t, second, table) {
			t.Fatalf("expected %s table to still exist after second bootstrap", table)
		}
	}
	if after := readTableColumns(t, second, "request_captures"); len(before) != len(after) {
		t.Fatalf("expected additive columns migration to be idempotent, before=%#v after=%#v", before, after)
	}
}
