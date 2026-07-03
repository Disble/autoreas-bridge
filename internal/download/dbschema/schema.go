// Package dbschema declares the TableSchema descriptors for all download-owned bridge
// tables. It is a separate sub-package of internal/download so that internal/sync can
// import it without a cycle: the download package's in-package test files import sync,
// which would create sync→download→sync if the schemas lived in package download.
// dbschema imports only persistence and has no dependency on sync or the parent download
// package, making the dependency direction acyclic.
package dbschema

import (
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/persistence"
)

const (
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
			up_to_date_count    INTEGER NOT NULL DEFAULT 0,
			jd_available        INTEGER NOT NULL DEFAULT 0,
			status              TEXT NOT NULL,
			error_summary       TEXT,
			manual_links_json   TEXT
		)`

	downloadRunsStartedAtIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_download_runs_started_at ON download_runs(started_at_ms DESC)`
)

// SchemaTables returns the TableSchema descriptors for all download-owned bridge tables:
// download_hoster_priority, download_jd_config, download_schedule_config, and download_runs.
// The sync bootstrap assembles this set with its own schemaTables() to form the complete
// bridge schema — neither context imports the other's table definitions.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "download_hoster_priority",
			CreateDDL: downloadHosterPriorityDDL,
		},
		{
			// download_jd_config uses Migrate instead of ColumnAdds: future column additions
			// require a transactional rename->create->copy->drop migration (design.md §4.2),
			// and the existing shape is validated to reject unknown mutations.
			Name:      "download_jd_config",
			CreateDDL: downloadJDConfigDDL,
			Migrate: func(db *sql.DB, cols []string) error {
				if !isCurrentDownloadJDConfigSchema(cols) {
					return fmt.Errorf("unsupported download_jd_config schema columns: %v", cols)
				}
				return nil
			},
		},
		{
			// download_schedule_config: additive ALTER adds enabled_weekdays when absent.
			// Legacy rows read back enabled_weekdays=NULL, which the store layer maps to
			// 127 (all days enabled) preserving today's every-day firing behavior.
			Name:      "download_schedule_config",
			CreateDDL: downloadScheduleConfigDDL,
			ColumnAdds: []persistence.ColumnMigration{
				{
					Column:   "enabled_weekdays",
					AlterDDL: `ALTER TABLE download_schedule_config ADD COLUMN enabled_weekdays INTEGER`,
				},
			},
		},
		{
			// download_runs: additive ALTER adds up_to_date_count when absent.
			// Legacy rows read back up_to_date_count=0 (up-to-date accounting starts at 0
			// for runs finalized before this migration, zero data rewrite needed).
			Name:      "download_runs",
			CreateDDL: downloadRunsDDL,
			ColumnAdds: []persistence.ColumnMigration{
				{
					Column:   "up_to_date_count",
					AlterDDL: `ALTER TABLE download_runs ADD COLUMN up_to_date_count INTEGER NOT NULL DEFAULT 0`,
				},
			},
			Indexes: []string{downloadRunsStartedAtIndexDDL},
		},
	}
}

// isCurrentDownloadJDConfigSchema reports whether the live column set matches the current
// download_jd_config shape. Any deviation is rejected (the table uses Migrate instead of
// ColumnAdds to surface unknown shapes as errors rather than silently pass through them).
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
