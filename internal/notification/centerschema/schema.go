// Package centerschema declares the TableSchema descriptors for all
// notification-center-owned bridge tables. It is a separate leaf sub-package of
// internal/notification so that internal/sync can import it without a cycle:
// internal/notification/center's in-package test files need a bootstrapped SQLite
// database (i.e. internal/sync), which would create sync→center→sync if the schemas
// lived in package center. centerschema imports only persistence and has no
// dependency on sync, center, or the parent notification package, making the
// dependency direction acyclic. Mirrors internal/download/dbschema/schema.go:1-6.
package centerschema

import "autoreas-bridge/internal/persistence"

const (
	notificationRecordsDDL = `
		CREATE TABLE IF NOT EXISTS notification_records (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at_ms  INTEGER NOT NULL,
			title          TEXT    NOT NULL,
			body           TEXT    NOT NULL,
			level          TEXT    NOT NULL,
			source         TEXT    NOT NULL,
			correlation_id TEXT,
			read_at_ms     INTEGER,
			archived_at_ms INTEGER,
			rows_json      TEXT
		)`
	notificationRecordActionsDDL = `
		CREATE TABLE IF NOT EXISTS notification_record_actions (
			id              TEXT    PRIMARY KEY,
			notification_id INTEGER NOT NULL,
			row_ref         TEXT,
			ordinal         INTEGER NOT NULL,
			label           TEXT    NOT NULL,
			intent          TEXT    NOT NULL,
			args_json       TEXT    NOT NULL,
			executed_at_ms  INTEGER,
			refused_reason  TEXT
		)`
	notificationRecordsTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_notification_records_time
		    ON notification_records(created_at_ms DESC, id DESC)`
	notificationRecordsActiveIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_notification_records_active
		    ON notification_records(archived_at_ms, created_at_ms DESC, id DESC)`
	notificationRecordsUnreadIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_notification_records_unread
		    ON notification_records(created_at_ms DESC, id DESC)
		    WHERE read_at_ms IS NULL`
	notificationRecordActionsNotificationIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_notification_record_actions_notification
		    ON notification_record_actions(notification_id, ordinal)`
)

// SchemaTables returns the notification-center-owned bridge table descriptors:
// notification_records and notification_record_actions. Both are create-only:
// no ColumnAdds, no Migrate, no version stamp -- born at their current shape,
// exactly like runtime_events.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "notification_records",
			CreateDDL: notificationRecordsDDL,
			Indexes: []string{
				notificationRecordsTimeIndexDDL,
				notificationRecordsActiveIndexDDL,
				notificationRecordsUnreadIndexDDL,
			},
		},
		{
			Name:      "notification_record_actions",
			CreateDDL: notificationRecordActionsDDL,
			Indexes: []string{
				notificationRecordActionsNotificationIndexDDL,
			},
		},
	}
}
