package sync

import (
	"database/sql"
	"fmt"
)

// appSettingsDDL creates the generic KV table used for user-facing preferences (SDD-31).
// The table is idempotent (CREATE TABLE IF NOT EXISTS) and requires no seed data — a
// missing row is the canonical default-false value for all boolean settings.
const appSettingsDDL = `
	CREATE TABLE IF NOT EXISTS app_settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`

// ensureAppSettingsSchema creates the app_settings table in db if it does not already
// exist. It is called once inside initializeBridgeDB so every bridge.db bootstrap
// automatically includes preferences support.
func ensureAppSettingsSchema(db *sql.DB) error {
	if _, err := db.Exec(appSettingsDDL); err != nil {
		return fmt.Errorf("ensure app_settings schema: %w", err)
	}
	return nil
}
