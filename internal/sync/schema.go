package sync

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/persistence"
)

const (
	animeSnapshotsDDL = `
		CREATE TABLE IF NOT EXISTS anime_snapshots (
			anime_id TEXT PRIMARY KEY,
			snapshot_json TEXT NOT NULL,
			snapshot_hash TEXT NOT NULL,
			modified_at INTEGER NOT NULL DEFAULT 0
		)`

	changelogDDL = `
		CREATE TABLE IF NOT EXISTS changelog (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			anime_id TEXT NOT NULL,
			change_type TEXT NOT NULL,
			changed_fields_json TEXT NOT NULL,
			snapshot_json TEXT,
			source_event_id TEXT,
			status TEXT NOT NULL,
			changed_at_ms INTEGER NOT NULL
		)`

	changelogSourceEventIndexDDL = `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_changelog_source_event
		ON changelog (source_event_id)
		WHERE source_event_id IS NOT NULL`

	conflictsDDL = `
		CREATE TABLE IF NOT EXISTS conflicts (
			conflict_id TEXT PRIMARY KEY,
			anime_id TEXT NOT NULL,
			local_snapshot_json TEXT NOT NULL,
			remote_snapshot_json TEXT NOT NULL,
			detected_at_ms INTEGER NOT NULL,
			status TEXT NOT NULL,
			resolved_at_ms INTEGER,
			resolution TEXT
		)`

	pairingTokensDDL = `
		CREATE TABLE IF NOT EXISTS pairing_tokens (
			token TEXT PRIMARY KEY,
			created_at_ms INTEGER NOT NULL,
			consumed_at_ms INTEGER
		)`

	devicesDDL = `
		CREATE TABLE IF NOT EXISTS devices (
			device_id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			auth_token TEXT NOT NULL UNIQUE,
			paired_at_ms INTEGER NOT NULL
		)`

	deviceSyncStateDDL = `
		CREATE TABLE IF NOT EXISTS device_sync_state (
			device_id TEXT PRIMARY KEY,
			last_ack_changelog_id INTEGER NOT NULL DEFAULT 0,
			last_seen_at_ms INTEGER NOT NULL,
			sync_status TEXT NOT NULL DEFAULT 'active'
		)`

	// bridgeOwnedAnimesDDL (SDD-48, ADR-48-1) tracks anime ids created natively
	// in Bridge (e.g. season creates via WriteService.CreateAnime), so the
	// reconcile diff can exempt them from the legacy-absence soft-delete
	// signal. Additive, create-only: it holds no anime state, only a hint the
	// reconcile consults.
	bridgeOwnedAnimesDDL = `
		CREATE TABLE IF NOT EXISTS bridge_owned_animes (
			anime_id TEXT PRIMARY KEY
		)`

	animeWriteOperationsDDL = `
		CREATE TABLE IF NOT EXISTS anime_write_operations (
			operation_id TEXT PRIMARY KEY,
			anime_id TEXT NOT NULL,
			batch_id TEXT NOT NULL DEFAULT '',
			batch_order INTEGER NOT NULL DEFAULT 0,
			batch_size INTEGER NOT NULL DEFAULT 1,
			base_modified_at INTEGER NOT NULL,
			intended_modified_at INTEGER NOT NULL,
			base_snapshot_json TEXT NOT NULL,
			base_hash TEXT NOT NULL,
			desired_snapshot_json TEXT NOT NULL,
			desired_hash TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('staged', 'committed', 'aborted', 'superseded')),
			created_at_ms INTEGER NOT NULL,
			committed_at_ms INTEGER
		)`

	animeWriteOperationsAnimeTokenIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_anime_write_operations_anime_token
		ON anime_write_operations (anime_id, intended_modified_at, status)`

	animeWriteOperationsRecoveryIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_anime_write_operations_recovery
		ON anime_write_operations (status, created_at_ms, operation_id)`

	animeWriteOperationsLiveReservationIndexDDL = `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_write_operations_live_reservation
		ON anime_write_operations (anime_id)
		WHERE status = 'staged'`

	animeChangedOutboxDDL = `
		CREATE TABLE IF NOT EXISTS anime_changed_outbox (
			event_id TEXT PRIMARY KEY,
			operation_id TEXT NOT NULL UNIQUE,
			anime_id TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('pending', 'published')),
			created_at_ms INTEGER NOT NULL,
			published_at_ms INTEGER,
			FOREIGN KEY (operation_id) REFERENCES anime_write_operations(operation_id)
		)`

	animeChangedOutboxPendingIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_anime_changed_outbox_pending
		ON anime_changed_outbox (status, created_at_ms, event_id)`

	animeBatchReplacementsDDL = `
		CREATE TABLE IF NOT EXISTS anime_batch_replacements (
			batch_id TEXT PRIMARY KEY,
			canonical_path TEXT NOT NULL,
			temp_path TEXT NOT NULL,
			backup_path TEXT NOT NULL,
			base_file_hash TEXT NOT NULL,
			desired_file_hash TEXT NOT NULL,
			phase TEXT NOT NULL CHECK (phase IN ('staged', 'temp_durable', 'backup_moved', 'promoted', 'finalized')),
			created_at_ms INTEGER NOT NULL,
			updated_at_ms INTEGER NOT NULL
		)`
)

// schemaTables returns the TableSchema descriptors for all sync-owned bridge tables.
// The composition root in initializeBridgeDB assembles this set with download.SchemaTables()
// to form the complete bridge schema without either context importing the other's definitions.
func schemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{
			Name:      "pairing_tokens",
			CreateDDL: pairingTokensDDL,
		},
		{
			Name:      "devices",
			CreateDDL: devicesDDL,
		},
		{
			Name:      "conflicts",
			CreateDDL: conflictsDDL,
		},
		{
			// anime_snapshots uses Migrate instead of plain ColumnAdds: it must reject
			// unknown column shapes (not silently add to them), per the SDD-30 introspection
			// precedent (ADR-30-1/§7). Legacy 3-col tables (anime_id, snapshot_json,
			// snapshot_hash) get modified_at added via safe additive ALTER; pre-existing rows
			// read back modified_at=0, a valid OCC base.
			Name:      "anime_snapshots",
			CreateDDL: animeSnapshotsDDL,
			Migrate: func(db *sql.DB, cols []string) error {
				for _, c := range cols {
					if c == "modified_at" {
						return nil // already migrated — noop
					}
				}
				if isLegacyAnimeSnapshotsSchema(cols) {
					if _, err := db.Exec(`ALTER TABLE anime_snapshots ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0`); err != nil {
						return fmt.Errorf("migrate legacy anime_snapshots schema: %w", err)
					}
					return nil
				}
				return fmt.Errorf("unsupported anime_snapshots schema columns: %v", cols)
			},
		},
		{
			// changelog uses Migrate for the legacy payload-only → multi-column rebuild path
			// (rename+copy+drop transaction, which additive ALTER cannot express).
			Name:      "changelog",
			CreateDDL: changelogDDL,
			Indexes:   []string{changelogSourceEventIndexDDL},
			Migrate: func(db *sql.DB, cols []string) error {
				if isCurrentChangelogSchema(cols) {
					if !containsSchemaColumn(cols, "source_event_id") {
						if _, err := db.Exec(`ALTER TABLE changelog ADD COLUMN source_event_id TEXT`); err != nil {
							return fmt.Errorf("add changelog source event identity: %w", err)
						}
					}
					return nil
				}
				if isLegacyPayloadOnlyChangelogSchema(cols) {
					return migrateLegacyChangelogSchema(db)
				}
				return fmt.Errorf("unsupported changelog schema columns: %v", cols)
			},
		},
		{
			// app_settings: idempotent create-only; no ColumnAdds, no Migrate.
			// A missing row is the canonical default-false value for all boolean settings.
			Name:      "app_settings",
			CreateDDL: appSettingsDDL,
		},
		{
			// device_sync_state: recovered at merge time — the sdd-34 registry
			// refactor dropped this table's creation (a latent regression: only
			// changelog_store writes to it, and no test bootstraps it fresh);
			// main's pre-registry bootstrap still created it. Create-only.
			Name:      "device_sync_state",
			CreateDDL: deviceSyncStateDDL,
		},
		{
			// bridge_owned_animes (SDD-48): idempotent create-only, no
			// ColumnAdds, no Migrate. A missing row means "not known to be
			// Bridge-native" — the reconcile treats absence as unowned.
			Name:      "bridge_owned_animes",
			CreateDDL: bridgeOwnedAnimesDDL,
		},
		{
			// anime_write_operations retains staged and committed pre-write
			// evidence for recovery and SDD-50. SDD-49 intentionally defines no
			// pruning path for these rows.
			Name:      "anime_write_operations",
			CreateDDL: animeWriteOperationsDDL,
			Indexes: []string{
				animeWriteOperationsAnimeTokenIndexDDL,
				animeWriteOperationsRecoveryIndexDDL,
				animeWriteOperationsLiveReservationIndexDDL,
			},
			Migrate: func(db *sql.DB, cols []string) error {
				if !containsSchemaColumn(cols, "batch_id") {
					if _, err := db.Exec(`ALTER TABLE anime_write_operations ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''`); err != nil {
						return fmt.Errorf("add anime_write_operations batch_id: %w", err)
					}
				}
				if !containsSchemaColumn(cols, "batch_order") {
					if _, err := db.Exec(`ALTER TABLE anime_write_operations ADD COLUMN batch_order INTEGER NOT NULL DEFAULT 0`); err != nil {
						return fmt.Errorf("add anime_write_operations batch_order: %w", err)
					}
				}
				if !containsSchemaColumn(cols, "batch_size") {
					if _, err := db.Exec(`ALTER TABLE anime_write_operations ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 1`); err != nil {
						return fmt.Errorf("add anime_write_operations batch_size: %w", err)
					}
				}
				return nil
			},
		},
		{
			Name:      "anime_changed_outbox",
			CreateDDL: animeChangedOutboxDDL,
			Indexes:   []string{animeChangedOutboxPendingIndexDDL},
		},
		{
			Name:      "anime_batch_replacements",
			CreateDDL: animeBatchReplacementsDDL,
		},
	}
}

func containsSchemaColumn(columns []string, want string) bool {
	for _, column := range columns {
		if column == want {
			return true
		}
	}
	return false
}

func isLegacyAnimeSnapshotsSchema(columns []string) bool {
	if len(columns) != 3 {
		return false
	}
	legacy := map[string]bool{"anime_id": false, "snapshot_json": false, "snapshot_hash": false}
	for _, column := range columns {
		if _, ok := legacy[column]; !ok {
			return false
		}
		legacy[column] = true
	}
	for _, present := range legacy {
		if !present {
			return false
		}
	}
	return true
}

func isCurrentChangelogSchema(columns []string) bool {
	required := map[string]bool{
		"id":                  false,
		"anime_id":            false,
		"change_type":         false,
		"changed_fields_json": false,
		"snapshot_json":       false,
		"status":              false,
		"changed_at_ms":       false,
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

func isLegacyPayloadOnlyChangelogSchema(columns []string) bool {
	if len(columns) != 4 {
		return false
	}
	legacy := map[string]bool{"id": false, "anime_id": false, "payload_json": false, "status": false}
	for _, column := range columns {
		if _, ok := legacy[column]; !ok {
			return false
		}
		legacy[column] = true
	}
	for _, present := range legacy {
		if !present {
			return false
		}
	}
	return true
}

func migrateLegacyChangelogSchema(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`ALTER TABLE changelog RENAME TO changelog_legacy`); err != nil {
		return err
	}
	if _, err = tx.Exec(changelogDDL); err != nil {
		return err
	}

	rows, err := tx.Query(`SELECT id, anime_id, payload_json, status FROM changelog_legacy ORDER BY id ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()

	nowMs := time.Now().UnixMilli()
	for rows.Next() {
		var id int64
		var animeID string
		var payload sql.NullString
		var status string
		if err = rows.Scan(&id, &animeID, &payload, &status); err != nil {
			return err
		}
		snapshotJSON := ""
		changedFieldsJSON := "[]"
		changeType := "update"
		if payload.Valid && payload.String != "" {
			snapshotJSON = payload.String
			changedFieldsJSON = deriveChangedFieldsJSONFromLegacyPayload(payload.String)
		}
		changedAtMs := nowMs + id
		if _, err = tx.Exec(`
			INSERT INTO changelog (id, anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, id, animeID, changeType, changedFieldsJSON, snapshotJSON, status, changedAtMs); err != nil {
			return err
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}

	if _, err = tx.Exec(`DROP TABLE changelog_legacy`); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM sqlite_sequence WHERE name = 'changelog'`); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO sqlite_sequence(name, seq) SELECT 'changelog', COALESCE(MAX(id), 0) FROM changelog`); err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	return nil
}

func deriveChangedFieldsJSONFromLegacyPayload(payload string) string {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		return `[]`
	}
	fields := make([]string, 0, len(raw))
	for key := range raw {
		switch key {
		case "_id":
			continue
		default:
			fields = append(fields, key)
		}
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		return `[]`
	}
	return string(encoded)
}
