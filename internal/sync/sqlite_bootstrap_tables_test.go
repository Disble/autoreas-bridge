package sync

import "testing"

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
	for i, expected := range want {
		if got[i] != expected {
			t.Fatalf("expected seeded row %d to be %#v, got %#v", i, expected, got[i])
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
