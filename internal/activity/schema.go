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
			reported_at_ms INTEGER,
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
	// activityLogReportedAtDDL adds the SDD-73 provenance column to an existing
	// table. The instant a change reports for itself is stored beside the instant
	// the bridge observed it; neither is derived from the other, so an absent
	// report stays NULL rather than defaulting to the observation instant.
	// Nullable on purpose: rows written before this column existed carry no
	// report, which is a different fact from a report equal to the observation.
	activityLogReportedAtDDL = `
		ALTER TABLE activity_log ADD COLUMN reported_at_ms INTEGER`
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
			// indexes; one additive column migration (SDD-73),
			// reported_at_ms, applied only when absent.
			Name:      "activity_log",
			CreateDDL: activityLogDDL,
			ColumnAdds: []persistence.ColumnMigration{
				{Column: "reported_at_ms", AlterDDL: activityLogReportedAtDDL},
			},
			Indexes: []string{
				activityLogOccurredAtIndexDDL,
				activityLogAnimeIndexDDL,
				activityLogActionIndexDDL,
				activityLogCorrelationIndexDDL,
			},
		},
	}
}
