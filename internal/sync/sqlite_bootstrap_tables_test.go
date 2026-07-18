package sync

import (
	"database/sql"
	"testing"
)

type hosterPriorityRow struct {
	hoster   string
	priority int
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
		"last_run_at_ms", "last_run_status", "next_run_at_ms", "enabled_weekdays",
	} {
		if !containsString(scheduleConfigColumns, required) {
			t.Fatalf("expected download_schedule_config to contain column %q, got %#v", required, scheduleConfigColumns)
		}
	}

	runsColumns := readTableColumns(t, db, "download_runs")
	for _, required := range []string{
		"run_id", "started_at_ms", "finished_at_ms", "trigger",
		"animes_checked", "episodes_found", "episodes_downloaded", "episodes_failed",
		"skipped_count", "up_to_date_count", "jd_available", "status", "error_summary", "manual_links_json",
	} {
		if !containsString(runsColumns, required) {
			t.Fatalf("expected download_runs table to contain column %q, got %#v", required, runsColumns)
		}
	}
}

func TestBootstrapBridgeDBIsIdempotentForDownloadTables(t *testing.T) {
	t.Parallel()

	bootstrap := newTestBootstrap(t)
	first, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("first bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, first)
	if !tableExists(t, first, "download_hoster_priority") {
		t.Fatal("expected download_hoster_priority table after first bootstrap")
	}

	second, err := bootstrap.BootstrapBridgeDB()
	if err != nil {
		t.Fatalf("second bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, second)
	if !tableExists(t, second, "download_runs") {
		t.Fatal("expected download_runs table to still exist after second bootstrap")
	}
}

func TestBootstrapBridgeDBSeedsDefaultHosterPriorityWhenEmpty(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	got := readHosterPriorityRowsForSite(t, db, "jkanime")

	want := []hosterPriorityRow{
		{hoster: "Mediafire", priority: 0},
		{hoster: "Mega", priority: 1},
		{hoster: "Vidhide", priority: 2},
		{hoster: "Mp4upload", priority: 3},
		{hoster: "Mixdrop", priority: 4},
	}
	if len(got) != len(want) {
		t.Fatalf("expected %d seeded hoster priority rows, got %#v", len(want), got)
	}
	for i, expected := range want {
		if got[i] != expected {
			t.Fatalf("expected seeded row %d to be %#v, got %#v", i, expected, got[i])
		}
	}
}

func TestEnsureDefaultHosterPriorityBackfillsMissingHostersPreservingUserOrder(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	// Simulate an existing install: the table is already populated with the
	// original two defaults in a user-reordered order (Mega first). Wipe the
	// fresh-bootstrap seed and re-seed just those two rows.
	if _, err := db.Exec(`DELETE FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite); err != nil {
		t.Fatalf("clear seeded rows: %v", err)
	}
	for _, row := range []struct {
		hoster   string
		priority int
	}{{"Mega", 0}, {"Mediafire", 1}} {
		if _, err := db.Exec(`INSERT INTO download_hoster_priority (site, hoster, priority, enabled) VALUES (?, ?, ?, 1)`, defaultHosterPrioritySite, row.hoster, row.priority); err != nil {
			t.Fatalf("seed existing row %q: %v", row.hoster, err)
		}
	}

	if err := ensureDefaultHosterPriority(db); err != nil {
		t.Fatalf("ensure default hoster priority: %v", err)
	}

	got := readHosterPriorityRowsForSite(t, db, defaultHosterPrioritySite)

	// User's original ordering is preserved; missing defaults are appended after
	// the current max priority in seed order.
	want := []hosterPriorityRow{
		{hoster: "Mega", priority: 0},
		{hoster: "Mediafire", priority: 1},
		{hoster: "Vidhide", priority: 2},
		{hoster: "Mp4upload", priority: 3},
		{hoster: "Mixdrop", priority: 4},
	}
	if len(got) != len(want) {
		t.Fatalf("expected %d rows after backfill, got %#v", len(want), got)
	}
	for i, expected := range want {
		if got[i] != expected {
			t.Fatalf("expected row %d to be %#v, got %#v", i, expected, got[i])
		}
	}

	// Running again must be a no-op (idempotent).
	if err := ensureDefaultHosterPriority(db); err != nil {
		t.Fatalf("second ensure: %v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite).Scan(&count); err != nil {
		t.Fatalf("count after second ensure: %v", err)
	}
	if count != len(want) {
		t.Fatalf("expected ensure to be idempotent (%d rows), got %d", len(want), count)
	}
}

// readHosterPriorityRowsForSite reads hoster priority rows for one site.
func readHosterPriorityRowsForSite(t *testing.T, db *sql.DB, site string) []hosterPriorityRow {
	t.Helper()
	rows, err := db.Query(`SELECT hoster, priority FROM download_hoster_priority WHERE site = ? ORDER BY priority ASC`, site)
	if err != nil {
		t.Fatalf("query hoster priority: %v", err)
	}
	defer closeTestRows(t, rows)
	var got []hosterPriorityRow
	for rows.Next() {
		var row hosterPriorityRow
		if err := rows.Scan(&row.hoster, &row.priority); err != nil {
			t.Fatalf("scan row: %v", err)
		}
		got = append(got, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate rows: %v", err)
	}
	return got
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

func TestEnsureDownloadScheduleConfigSchemaCreatesFreshTableWithEnabledWeekdays(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	columns := readTableColumns(t, db, "download_schedule_config")
	for _, required := range []string{
		"id", "mode", "daily_time_hhmm", "enabled",
		"last_run_at_ms", "last_run_status", "next_run_at_ms", "enabled_weekdays",
	} {
		if !containsString(columns, required) {
			t.Fatalf("expected fresh download_schedule_config to contain column %q, got %#v", required, columns)
		}
	}
}

func TestEnsureDownloadScheduleConfigSchemaIsIdempotentColumnIntrospection(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	before := readTableColumns(t, db, "download_schedule_config")
	if err := ensureDownloadScheduleConfigSchema(db); err != nil {
		t.Fatalf("ensure download_schedule_config schema again: %v", err)
	}
	after := readTableColumns(t, db, "download_schedule_config")
	if len(before) != len(after) {
		t.Fatalf("expected column-introspection migration to be idempotent, before=%#v after=%#v", before, after)
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
