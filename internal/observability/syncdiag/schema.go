// Package syncdiag owns the wire contract, closed-vocabulary validation, and
// the bounded write path behind POST /api/sync/diagnostics: the endpoint
// that lets a mobile device durably report sync-cycle diagnostics instead of
// losing them on delivery failure. It is a sibling of
// internal/observability/eventlog, never an extension of it -- the two
// domains share no logic (disjoint record shape, disjoint columns, disjoint
// filter fields).
package syncdiag

import "autoreas-bridge/internal/persistence"

const (
	deviceSyncDiagnosticsDDL = `
		CREATE TABLE IF NOT EXISTS device_sync_diagnostics (
			device_id                    TEXT NOT NULL,
			reported_at_ms               INTEGER NOT NULL,
			cycle_id                     TEXT NOT NULL UNIQUE,
			-- degraded is a FIDELITY signal, not a health signal: it is the only
			-- column decided by the client's size cap at serialization time,
			-- rather than by anything the cycle observed. A perfectly healthy
			-- cycle with a full event ring can still ship degraded = 'events'.
			-- It reports how complete the record is, not how the device is
			-- doing -- degraded IS NOT NULL is not a health indicator. Each
			-- value implies every lighter piece is ABSENT from this payload --
			-- shed or never present. It does not assert that a lighter piece
			-- was dropped.
			degraded                     TEXT,
			trigger_source               TEXT NOT NULL,
			-- app_state is stored but never a filter dimension: the client
			-- hardcodes it to 'background', so a foreground_service cycle also
			-- reports 'background'. trigger_source is the only trustworthy
			-- discriminator.
			app_state                    TEXT NOT NULL,
			consecutive_unclosed_cycles  INTEGER NOT NULL,
			pending_ops_count            INTEGER NOT NULL,
			cursor                       INTEGER NOT NULL,
			recent_events_json           TEXT NOT NULL DEFAULT '[]',
			-- previous_cycle_id is a distinct column from cycle_id above, with
			-- no FK to it: the previous cycle's identity is informational only.
			previous_cycle_id            TEXT,
			previous_trigger_source      TEXT,
			-- previous_outcome's NOT NULL-whenever-present rule is enforced in
			-- validation, not DDL: the whole previous_cycle object may be null,
			-- in which case every previous_* column, including this one, is
			-- NULL together.
			previous_outcome             TEXT,
			previous_last_stage          TEXT,
			previous_started_at          INTEGER,
			previous_elapsed_ms          INTEGER,
			previous_error_name          TEXT,
			-- native_errcode_byte is a char code, not a SQLite result code: 5
			-- means the control byte was 0x05, NOT SQLITE_BUSY.
			previous_native_errcode_byte INTEGER,
			previous_error_stage         TEXT,
			previous_error_cause         TEXT,
			previous_error_fingerprint   TEXT
		)`
	deviceSyncDiagnosticsTriggerSourceIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_trigger_source
		    ON device_sync_diagnostics(trigger_source, reported_at_ms DESC)`
	deviceSyncDiagnosticsPreviousOutcomeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_previous_outcome
		    ON device_sync_diagnostics(previous_outcome, reported_at_ms DESC)`
	deviceSyncDiagnosticsPreviousErrorFingerprintIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_previous_error_fingerprint
		    ON device_sync_diagnostics(previous_error_fingerprint)`
	deviceSyncDiagnosticsDeviceIDIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_device_id
		    ON device_sync_diagnostics(device_id, reported_at_ms DESC)`
)

// SchemaTables returns the syncdiag-owned bridge table descriptor for the
// schema registry. device_sync_diagnostics is create-only: no ColumnAdds, no
// Migrate -- the table is born at its full 21-column shape, so the migration
// hook is never invoked.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "device_sync_diagnostics",
			CreateDDL: deviceSyncDiagnosticsDDL,
			Indexes: []string{
				deviceSyncDiagnosticsTriggerSourceIndexDDL,
				deviceSyncDiagnosticsPreviousOutcomeIndexDDL,
				deviceSyncDiagnosticsPreviousErrorFingerprintIndexDDL,
				deviceSyncDiagnosticsDeviceIDIndexDDL,
			},
		},
	}
}
