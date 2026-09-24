// Package telemetry owns the kind-discriminated telemetry store behind
// POST /api/sync/diagnostics: one table keyed by kind, one registry of
// complete kind declarations, and one bounded write path. It replaces the
// single-shape device_sync_diagnostics table so a new event kind is a code
// change -- a registry entry -- instead of a new table, reader, endpoint and
// retention policy.
//
// The table is create-only and this package declares no Migrate hook and no
// ColumnAdds. Reshaping a row that already exists is forbidden inside the
// Bridge lifecycle, so a kind that needs a queryable field extends the
// forward schema, never the history.
package telemetry

import "autoreas-bridge/internal/persistence"

const (
	deviceTelemetryEventsDDL = `
		CREATE TABLE IF NOT EXISTS device_telemetry_events (
			device_id       TEXT NOT NULL,
			reported_at_ms  INTEGER NOT NULL,
			kind            TEXT NOT NULL,
			event_id        TEXT NOT NULL,
			observed_at_ms  INTEGER,
			degraded        TEXT,
			-- payload_json is the kind's own re-serialized record. Every write
			-- binds it, so the '{}' default is a defensive floor for a row
			-- written outside Insert, never a shape the store produces.
			payload_json    TEXT NOT NULL DEFAULT '{}',
			-- Identity is scoped per kind: one kind's key is not another
			-- kind's, so a cycle_report key and a second kind's key may be
			-- the same string and must stay two rows.
			UNIQUE (kind, event_id)
		)`
	// deviceTelemetryEventsKindReportedAtIndexDDL serves both the per-kind
	// recency read and the per-kind prune: both filter on one kind and order
	// by reported_at_ms, which is exactly this index's key order.
	deviceTelemetryEventsKindReportedAtIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_device_telemetry_events_kind_reported_at
		    ON device_telemetry_events(kind, reported_at_ms DESC)`
	// deviceTelemetryEventsDeviceReportedAtIndexDDL serves the per-device
	// read: device_id is the only other column any surface filters on.
	deviceTelemetryEventsDeviceReportedAtIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_device_telemetry_events_device_reported_at
		    ON device_telemetry_events(device_id, reported_at_ms DESC)`
)

// SchemaTables returns the telemetry-owned table descriptor for the schema
// registry. device_telemetry_events is create-only: no Migrate, no
// ColumnAdds, because a kind arrives as one complete registry declaration and
// never as a column added to history.
//
// Exactly two indexes are declared, both of them used by a real query. The
// three speculative indexes syncdiag carried (trigger_source,
// previous_outcome, previous_error_fingerprint) are deliberately not carried
// over: no query filters or sorts on any of them, so they bought write cost
// and nothing else.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "device_telemetry_events",
			CreateDDL: deviceTelemetryEventsDDL,
			Indexes: []string{
				deviceTelemetryEventsKindReportedAtIndexDDL,
				deviceTelemetryEventsDeviceReportedAtIndexDDL,
			},
		},
	}
}
