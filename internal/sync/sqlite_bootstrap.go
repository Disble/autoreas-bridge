package sync

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	downloadconfig "autoreas-bridge/internal/download/config"
	_ "modernc.org/sqlite"
)

const (
	bridgeDataDirName = "Autoreas"
	bridgeDataSubdir  = "data"
	bridgeDBName      = "bridge.db"
	sqliteDriverName  = "sqlite"
	busyTimeoutMillis = 5000
	animeSnapshotsDDL = `
		CREATE TABLE IF NOT EXISTS anime_snapshots (
			anime_id TEXT PRIMARY KEY,
			snapshot_json TEXT NOT NULL,
			snapshot_hash TEXT NOT NULL,
			modified_at INTEGER NOT NULL DEFAULT 0
		)`
	changelogDDL = `
		CREATE TABLE IF NOT EXISTS changelog (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			anime_id TEXT NOT NULL,
			change_type TEXT NOT NULL,
			changed_fields_json TEXT NOT NULL,
			snapshot_json TEXT,
			status TEXT NOT NULL,
			changed_at_ms INTEGER NOT NULL
		)`
	deviceSyncStateDDL = `
		CREATE TABLE IF NOT EXISTS device_sync_state (
			device_id TEXT PRIMARY KEY,
			last_ack_changelog_id INTEGER NOT NULL DEFAULT 0,
			last_seen_at_ms INTEGER NOT NULL,
			sync_status TEXT NOT NULL DEFAULT 'active'
		)`
	activityLogDDL = `
		CREATE TABLE IF NOT EXISTS activity_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source TEXT NOT NULL,
			action_type TEXT NOT NULL,
			anime_id TEXT NOT NULL,
			anime_name TEXT NOT NULL,
			occurred_at_ms INTEGER NOT NULL,
			correlation_id TEXT,
			before_json TEXT,
			after_json TEXT
		)`
	activityLogOccurredAtIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_activity_log_occurred_at ON activity_log(occurred_at_ms DESC, id DESC)`
	activityLogAnimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_activity_log_anime ON activity_log(anime_id, occurred_at_ms DESC)`
	activityLogActionIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action_type, occurred_at_ms DESC)`
	activityLogCorrelationIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_activity_log_correlation ON activity_log(correlation_id)`
	conflictsDDL = `
		CREATE TABLE IF NOT EXISTS conflicts (
			conflict_id TEXT PRIMARY KEY,
			anime_id TEXT NOT NULL,
			local_snapshot_json TEXT NOT NULL,
			remote_snapshot_json TEXT NOT NULL,
			detected_at_ms INTEGER NOT NULL,
			status TEXT NOT NULL,
			resolved_at_ms INTEGER,
			resolution TEXT
		)`
	pairingTokensDDL = `
		CREATE TABLE IF NOT EXISTS pairing_tokens (
			token TEXT PRIMARY KEY,
			created_at_ms INTEGER NOT NULL,
			consumed_at_ms INTEGER
		)`
	devicesDDL = `
		CREATE TABLE IF NOT EXISTS devices (
			device_id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			auth_token TEXT NOT NULL UNIQUE,
			paired_at_ms INTEGER NOT NULL
		)`
	downloadHosterPriorityDDL = `
		CREATE TABLE IF NOT EXISTS download_hoster_priority (
			site     TEXT    NOT NULL,
			hoster   TEXT    NOT NULL,
			priority INTEGER NOT NULL,
			enabled  INTEGER NOT NULL DEFAULT 1,
			PRIMARY KEY (site, hoster)
		)`
	downloadJDConfigDDL = `
		CREATE TABLE IF NOT EXISTS download_jd_config (
			id                       INTEGER PRIMARY KEY CHECK (id = 1),
			myjd_email               TEXT,
			myjd_password_encrypted  BLOB,
			device_name              TEXT,
			exe_path_override        TEXT,
			default_dest_dir         TEXT,
			last_seen_status         TEXT,
			last_seen_at_ms          INTEGER,
			last_decrypt_error       TEXT
		)`
	downloadScheduleConfigDDL = `
		CREATE TABLE IF NOT EXISTS download_schedule_config (
			id               INTEGER PRIMARY KEY CHECK (id = 1),
			mode             TEXT    NOT NULL DEFAULT 'in_process',
			daily_time_hhmm  TEXT,
			enabled          INTEGER NOT NULL DEFAULT 0,
			last_run_at_ms   INTEGER,
			last_run_status  TEXT,
			next_run_at_ms   INTEGER,
			enabled_weekdays INTEGER
		)`
	downloadRunsDDL = `
		CREATE TABLE IF NOT EXISTS download_runs (
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
		)`
	downloadRunsStartedAtIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_download_runs_started_at ON download_runs(started_at_ms DESC)`
	defaultHosterPrioritySite = "jkanime"
)

type SQLiteBootstrap struct {
	userConfigDir func() (string, error)
	mkdirAll      func(path string, perm os.FileMode) error
	openDB        func(driverName string, dataSourceName string) (*sql.DB, error)
}

func (b SQLiteBootstrap) ResolveBridgeDBPath() (string, error) {
	userConfigDir := b.userConfigDir
	if userConfigDir == nil {
		userConfigDir = os.UserConfigDir
	}

	mkdirAll := b.mkdirAll
	if mkdirAll == nil {
		mkdirAll = os.MkdirAll
	}

	baseDir, err := userConfigDir()
	if err != nil {
		return "", err
	}

	dataDir := filepath.Join(baseDir, bridgeDataDirName, bridgeDataSubdir)
	if err := mkdirAll(dataDir, 0o755); err != nil {
		return "", err
	}

	return filepath.Join(dataDir, bridgeDBName), nil
}

func ResolveBridgeDBPath() (string, error) {
	return SQLiteBootstrap{}.ResolveBridgeDBPath()
}

func (b SQLiteBootstrap) OpenBridgeDB(path string) (*sql.DB, error) {
	openDB := b.openDB
	if openDB == nil {
		openDB = sql.Open
	}

	db, err := openDB(sqliteDriverName, path)
	if err != nil {
		return nil, fmt.Errorf("open bridge db %q: %w", path, err)
	}

	if err := initializeBridgeDB(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("initialize bridge db %q: %w", path, err)
	}

	return db, nil
}

func OpenBridgeDB(path string) (*sql.DB, error) {
	return SQLiteBootstrap{}.OpenBridgeDB(path)
}

func (b SQLiteBootstrap) BootstrapBridgeDB() (*sql.DB, error) {
	path, err := b.ResolveBridgeDBPath()
	if err != nil {
		return nil, fmt.Errorf("resolve bridge db path: %w", err)
	}

	return b.OpenBridgeDB(path)
}

func BootstrapBridgeDB() (*sql.DB, error) {
	return SQLiteBootstrap{}.BootstrapBridgeDB()
}

func initializeBridgeDB(db *sql.DB) error {
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping bridge db: %w", err)
	}

	if err := applyBridgePragmas(db); err != nil {
		return err
	}

	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		return err
	}
	if err := ensureChangelogSchema(db); err != nil {
		return err
	}
	if _, err := db.Exec(deviceSyncStateDDL); err != nil {
		return fmt.Errorf("ensure device_sync_state schema: %w", err)
	}
	if err := ensureActivityLogSchema(db); err != nil {
		return err
	}
	if _, err := db.Exec(conflictsDDL); err != nil {
		return fmt.Errorf("ensure conflicts schema: %w", err)
	}
	if _, err := db.Exec(pairingTokensDDL); err != nil {
		return fmt.Errorf("ensure pairing_tokens schema: %w", err)
	}
	if _, err := db.Exec(devicesDDL); err != nil {
		return fmt.Errorf("ensure devices schema: %w", err)
	}
	if _, err := db.Exec(downloadHosterPriorityDDL); err != nil {
		return fmt.Errorf("ensure download_hoster_priority schema: %w", err)
	}
	if err := ensureDownloadJDConfigSchema(db); err != nil {
		return err
	}
	if err := ensureDownloadScheduleConfigSchema(db); err != nil {
		return err
	}
	if _, err := db.Exec(downloadRunsDDL); err != nil {
		return fmt.Errorf("ensure download_runs schema: %w", err)
	}
	if _, err := db.Exec(downloadRunsStartedAtIndexDDL); err != nil {
		return fmt.Errorf("ensure download_runs started_at index: %w", err)
	}
	if err := seedDefaultHosterPriorityIfEmpty(db); err != nil {
		return err
	}
	if err := ensureAppSettingsSchema(db); err != nil {
		return err
	}

	return nil
}

func ensureActivityLogSchema(db *sql.DB) error {
	if _, err := db.Exec(activityLogDDL); err != nil {
		return fmt.Errorf("ensure activity_log schema: %w", err)
	}
	indexes := []struct {
		name string
		ddl  string
	}{
		{name: "activity_log occurred_at index", ddl: activityLogOccurredAtIndexDDL},
		{name: "activity_log anime index", ddl: activityLogAnimeIndexDDL},
		{name: "activity_log action index", ddl: activityLogActionIndexDDL},
		{name: "activity_log correlation index", ddl: activityLogCorrelationIndexDDL},
	}
	for _, index := range indexes {
		if _, err := db.Exec(index.ddl); err != nil {
			return fmt.Errorf("ensure %s: %w", index.name, err)
		}
	}
	return nil
}

// ensureAnimeSnapshotsSchema follows the verified ensureChangelogSchema column-introspection
// precedent (SDD-30, ADR-30-1/§7): a missing table is created fresh with modified_at already
// present; an already-migrated table is a noop; a legacy 3-column table (anime_id, snapshot_json,
// snapshot_hash) gets the new modified_at column added in place via a SAFE additive ALTER TABLE
// (no data rewrite needed -- pre-existing rows read back modified_at=0, a valid OCC base per
// design.md §7). Any other column set is rejected as unsupported.
func ensureAnimeSnapshotsSchema(db *sql.DB) error {
	columns, err := tableColumns(db, "anime_snapshots")
	if err != nil {
		return fmt.Errorf("inspect anime_snapshots schema: %w", err)
	}
	if len(columns) == 0 {
		if _, err := db.Exec(animeSnapshotsDDL); err != nil {
			return fmt.Errorf("ensure anime_snapshots schema: %w", err)
		}
		return nil
	}
	if containsColumn(columns, "modified_at") {
		return nil
	}
	if isLegacyAnimeSnapshotsSchema(columns) {
		if _, err := db.Exec(`ALTER TABLE anime_snapshots ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("migrate legacy anime_snapshots schema: %w", err)
		}
		return nil
	}
	return fmt.Errorf("unsupported anime_snapshots schema columns: %v", columns)
}

func isLegacyAnimeSnapshotsSchema(columns []string) bool {
	if len(columns) != 3 {
		return false
	}
	legacy := map[string]bool{"anime_id": false, "snapshot_json": false, "snapshot_hash": false}
	for _, column := range columns {
		if _, ok := legacy[column]; !ok {
			return false
		}
		legacy[column] = true
	}
	for _, present := range legacy {
		if !present {
			return false
		}
	}
	return true
}

func containsColumn(columns []string, target string) bool {
	for _, column := range columns {
		if column == target {
			return true
		}
	}
	return false
}

// ensureDownloadJDConfigSchema follows the verified ensureChangelogSchema column-introspection
// precedent: a missing table is created fresh; any future column addition (e.g. a cached-devices
// column) would extend this function with a transactional rename->create->copy->drop migration
// rather than an in-place ALTER (design.md §4.2).
func ensureDownloadJDConfigSchema(db *sql.DB) error {
	columns, err := tableColumns(db, "download_jd_config")
	if err != nil {
		return fmt.Errorf("inspect download_jd_config schema: %w", err)
	}
	if len(columns) == 0 {
		if _, err := db.Exec(downloadJDConfigDDL); err != nil {
			return fmt.Errorf("ensure download_jd_config schema: %w", err)
		}
		return nil
	}
	if !isCurrentDownloadJDConfigSchema(columns) {
		return fmt.Errorf("unsupported download_jd_config schema columns: %v", columns)
	}
	return nil
}

func isCurrentDownloadJDConfigSchema(columns []string) bool {
	required := map[string]bool{
		"id":                      false,
		"myjd_email":              false,
		"myjd_password_encrypted": false,
		"device_name":             false,
		"exe_path_override":       false,
		"default_dest_dir":        false,
		"last_seen_status":        false,
		"last_seen_at_ms":         false,
		"last_decrypt_error":      false,
	}
	for _, column := range columns {
		if _, ok := required[column]; ok {
			required[column] = true
		}
	}
	for _, present := range required {
		if !present {
			return false
		}
	}
	return true
}

// ensureDownloadScheduleConfigSchema follows the verified ensureAnimeSnapshotsSchema
// column-introspection + additive-ALTER precedent (SDD download-schedule-weekdays design
// "SQLite migration follows the ensureAnimeSnapshotsSchema introspection + ALTER precedent"): a
// missing table is created fresh with enabled_weekdays already present; an already-migrated
// table is a noop; a legacy table (the original 7-column DDL, no enabled_weekdays) gets the
// column added in place via a SAFE additive ALTER TABLE -- nullable, no DEFAULT, so pre-existing
// rows read back enabled_weekdays=NULL, which the download store layer maps to 127 (all days
// enabled) on read, preserving today's every-day firing behavior with zero data rewrite.
func ensureDownloadScheduleConfigSchema(db *sql.DB) error {
	columns, err := tableColumns(db, "download_schedule_config")
	if err != nil {
		return fmt.Errorf("inspect download_schedule_config schema: %w", err)
	}
	if len(columns) == 0 {
		if _, err := db.Exec(downloadScheduleConfigDDL); err != nil {
			return fmt.Errorf("ensure download_schedule_config schema: %w", err)
		}
		return nil
	}
	if containsColumn(columns, "enabled_weekdays") {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE download_schedule_config ADD COLUMN enabled_weekdays INTEGER`); err != nil {
		return fmt.Errorf("migrate legacy download_schedule_config schema: %w", err)
	}
	return nil
}

// seedDefaultHosterPriorityIfEmpty seeds the validated PoC defaults (Mediafire=0, Mega=1) for the
// jkanime site the first time download_hoster_priority is empty, per download-config spec
// "First run seeds defaults". It never overwrites an existing user-configured ordering.
func seedDefaultHosterPriorityIfEmpty(db *sql.DB) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM download_hoster_priority WHERE site = ?`, defaultHosterPrioritySite).Scan(&count); err != nil {
		return fmt.Errorf("count download_hoster_priority for site %q: %w", defaultHosterPrioritySite, err)
	}
	if count > 0 {
		return nil
	}

	for _, entry := range downloadconfig.DefaultHosterPrioritySeed {
		if _, err := db.Exec(`
			INSERT INTO download_hoster_priority (site, hoster, priority, enabled)
			VALUES (?, ?, ?, 1)
		`, defaultHosterPrioritySite, entry.Hoster, entry.Priority); err != nil {
			return fmt.Errorf("seed default hoster priority %q for site %q: %w", entry.Hoster, defaultHosterPrioritySite, err)
		}
	}
	return nil
}

func ensureChangelogSchema(db *sql.DB) error {
	columns, err := tableColumns(db, "changelog")
	if err != nil {
		return fmt.Errorf("inspect changelog schema: %w", err)
	}
	if len(columns) == 0 {
		if _, err := db.Exec(changelogDDL); err != nil {
			return fmt.Errorf("ensure changelog schema: %w", err)
		}
		return nil
	}
	if isCurrentChangelogSchema(columns) {
		return nil
	}
	if isLegacyPayloadOnlyChangelogSchema(columns) {
		if err := migrateLegacyChangelogSchema(db); err != nil {
			return fmt.Errorf("migrate legacy changelog schema: %w", err)
		}
		return nil
	}
	return fmt.Errorf("unsupported changelog schema columns: %v", columns)
}

func tableColumns(db *sql.DB, tableName string) ([]string, error) {
	rows, err := db.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

func isCurrentChangelogSchema(columns []string) bool {
	required := map[string]bool{
		"id":                  false,
		"anime_id":            false,
		"change_type":         false,
		"changed_fields_json": false,
		"snapshot_json":       false,
		"status":              false,
		"changed_at_ms":       false,
	}
	for _, column := range columns {
		if _, ok := required[column]; ok {
			required[column] = true
		}
	}
	for _, present := range required {
		if !present {
			return false
		}
	}
	return true
}

func isLegacyPayloadOnlyChangelogSchema(columns []string) bool {
	if len(columns) != 4 {
		return false
	}
	legacy := map[string]bool{"id": false, "anime_id": false, "payload_json": false, "status": false}
	for _, column := range columns {
		if _, ok := legacy[column]; !ok {
			return false
		}
		legacy[column] = true
	}
	for _, present := range legacy {
		if !present {
			return false
		}
	}
	return true
}

func migrateLegacyChangelogSchema(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`ALTER TABLE changelog RENAME TO changelog_legacy`); err != nil {
		return err
	}
	if _, err = tx.Exec(changelogDDL); err != nil {
		return err
	}

	rows, err := tx.Query(`SELECT id, anime_id, payload_json, status FROM changelog_legacy ORDER BY id ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()

	nowMs := time.Now().UnixMilli()
	for rows.Next() {
		var id int64
		var animeID string
		var payload sql.NullString
		var status string
		if err = rows.Scan(&id, &animeID, &payload, &status); err != nil {
			return err
		}
		snapshotJSON := ""
		changedFieldsJSON := "[]"
		changeType := "update"
		if payload.Valid && payload.String != "" {
			snapshotJSON = payload.String
			changedFieldsJSON = deriveChangedFieldsJSONFromLegacyPayload(payload.String)
		}
		changedAtMs := nowMs + id
		if _, err = tx.Exec(`
			INSERT INTO changelog (id, anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, id, animeID, changeType, changedFieldsJSON, snapshotJSON, status, changedAtMs); err != nil {
			return err
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}

	if _, err = tx.Exec(`DROP TABLE changelog_legacy`); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM sqlite_sequence WHERE name = 'changelog'`); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO sqlite_sequence(name, seq) SELECT 'changelog', COALESCE(MAX(id), 0) FROM changelog`); err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	return nil
}

func deriveChangedFieldsJSONFromLegacyPayload(payload string) string {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		return `[]`
	}
	fields := make([]string, 0, len(raw))
	for key := range raw {
		switch key {
		case "_id":
			continue
		default:
			fields = append(fields, key)
		}
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		return `[]`
	}
	return string(encoded)
}

func applyBridgePragmas(db *sql.DB) error {
	var journalMode string
	if err := db.QueryRow("PRAGMA journal_mode = WAL;").Scan(&journalMode); err != nil {
		return fmt.Errorf("set journal_mode WAL: %w", err)
	}
	if journalMode != "wal" {
		return fmt.Errorf("verify journal_mode WAL: got %q", journalMode)
	}

	if _, err := db.Exec(fmt.Sprintf("PRAGMA busy_timeout = %d;", busyTimeoutMillis)); err != nil {
		return fmt.Errorf("set busy_timeout %d: %w", busyTimeoutMillis, err)
	}

	var busyTimeout int
	if err := db.QueryRow("PRAGMA busy_timeout;").Scan(&busyTimeout); err != nil {
		return fmt.Errorf("verify busy_timeout %d: %w", busyTimeoutMillis, err)
	}
	if busyTimeout != busyTimeoutMillis {
		return fmt.Errorf("verify busy_timeout %d: got %d", busyTimeoutMillis, busyTimeout)
	}

	return nil
}
