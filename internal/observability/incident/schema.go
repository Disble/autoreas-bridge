package incident

import "autoreas-bridge/internal/persistence"

const (
	incidentsDDL = `
		CREATE TABLE IF NOT EXISTS incidents (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			fingerprint     TEXT NOT NULL,
			reason          TEXT NOT NULL,
			occurred_at_ms  INTEGER NOT NULL,
			window_start_ms INTEGER NOT NULL,
			window_end_ms   INTEGER NOT NULL,
			source_kind     TEXT NOT NULL,
			source_id       TEXT NOT NULL
		)`
	incidentsFingerprintIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_incidents_fingerprint_time
		    ON incidents(fingerprint, occurred_at_ms)`
	incidentsWindowIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_incidents_window_start
		    ON incidents(window_start_ms)`
)

// SchemaTables returns the incident-owned bridge table descriptor for the
// schema registry. incidents is create-only: it is born at its current shape,
// so it has no ColumnAdds and no Migrate hook.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "incidents",
			CreateDDL: incidentsDDL,
			Indexes:   []string{incidentsFingerprintIndexDDL, incidentsWindowIndexDDL},
		},
	}
}
