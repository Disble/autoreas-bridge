package activity

import "autoreas-bridge/internal/persistence"

const (
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
)

// SchemaTables returns the activity-owned bridge table descriptors for the
// sdd-34 schema registry. The activity_log DDL lives HERE (not in
// internal/sync) per the architecture boundary enforced by
// tools/checkarchitecture: activity owns every reference to its table; the
// bootstrap composition root only assembles the descriptor set.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			// activity_log: idempotent create-only plus its four read-path
			// indexes; no ColumnAdds, no Migrate.
			Name:      "activity_log",
			CreateDDL: activityLogDDL,
			Indexes: []string{
				activityLogOccurredAtIndexDDL,
				activityLogAnimeIndexDDL,
				activityLogActionIndexDDL,
				activityLogCorrelationIndexDDL,
			},
		},
	}
}
