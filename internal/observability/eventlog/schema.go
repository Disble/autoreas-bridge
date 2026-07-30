// Package eventlog persists runtime log entries (the logger.LogEntry shape)
// into bridge SQLite and exposes a read-only query surface over them. It is a
// sibling of internal/observability/requestcapture, not an extension of it:
// the two domains share no logic (disjoint record shape, disjoint columns,
// disjoint filter fields).
package eventlog

import "autoreas-bridge/internal/persistence"

const (
	runtimeEventsDDL = `
		CREATE TABLE IF NOT EXISTS runtime_events (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			occurred_at_ms INTEGER NOT NULL,
			domain         TEXT NOT NULL,
			level          TEXT NOT NULL,
			message        TEXT NOT NULL,
			correlation_id TEXT,
			entity_id      TEXT,
			event_type     TEXT,
			duration_ms    INTEGER,
			metadata_json  TEXT
		)`
	runtimeEventsTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_runtime_events_time
		    ON runtime_events(occurred_at_ms DESC, id DESC)`
	runtimeEventsCorrelationIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_runtime_events_correlation
		    ON runtime_events(correlation_id, occurred_at_ms DESC, id DESC)`
	runtimeEventsDomainLevelIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_runtime_events_domain_level
		    ON runtime_events(domain, level, occurred_at_ms DESC, id DESC)`
)

// SchemaTables returns the eventlog-owned bridge table descriptor for the
// schema registry. runtime_events is create-only: no ColumnAdds, no Migrate,
// no version stamp -- the table is born at its current shape and the
// sidecar's tolerance is a presence probe, not a version comparison.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "runtime_events",
			CreateDDL: runtimeEventsDDL,
			Indexes: []string{
				runtimeEventsTimeIndexDDL,
				runtimeEventsCorrelationIndexDDL,
				runtimeEventsDomainLevelIndexDDL,
			},
		},
	}
}
