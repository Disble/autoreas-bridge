package sync

// appSettingsDDL creates the generic KV table used for user-facing preferences (SDD-31).
// The table is idempotent (CREATE TABLE IF NOT EXISTS) and requires no seed data — a
// missing row is the canonical default-false value for all boolean settings.
// Referenced by schemaTables() in schema.go.
const appSettingsDDL = `
	CREATE TABLE IF NOT EXISTS app_settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`
