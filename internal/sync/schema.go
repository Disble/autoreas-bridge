package sync

import "encoding/json"

const (
	animeSnapshotsDDL = `
		CREATE TABLE IF NOT EXISTS anime_snapshots (
			anime_id TEXT PRIMARY KEY,
			snapshot_json TEXT NOT NULL,
			snapshot_hash TEXT NOT NULL,
			modified_at INTEGER NOT NULL DEFAULT 0,
			schedule_day_migrated_at INTEGER NOT NULL DEFAULT 0,
			vocabulary_migrated_at INTEGER NOT NULL DEFAULT 0
		)`

	// schemaMigrationMarkersDDL creates the dedicated global one-shot migration
	// marker table (SDD-56). A per-row column on anime_snapshots cannot safely
	// gate a whole-database one-shot pass: anime_snapshot_store.go's INSERT
	// omits vocabulary_migrated_at, so any newly created row (written after the
	// vocabulary cutover, always English by construction) would default back to
	// 0 and incorrectly look "unmigrated" on the next boot, re-triggering the
	// private legacy-Spanish decoder against already-English content. A single
	// global marker row avoids that defect while still satisfying the
	// "vocabulary_migrated_at marker" requirement.
	schemaMigrationMarkersDDL = `
		CREATE TABLE IF NOT EXISTS schema_migration_markers (
			marker TEXT PRIMARY KEY,
			vocabulary_migrated_at INTEGER NOT NULL DEFAULT 0
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

	mobileRequestCapturesDDL = `
		CREATE TABLE IF NOT EXISTS mobile_request_captures (
			request_id TEXT PRIMARY KEY,
			captured_at_ms INTEGER NOT NULL,
			kind TEXT NOT NULL,
			route TEXT NOT NULL,
			transport TEXT NOT NULL,
			device_id TEXT NOT NULL,
			device_name TEXT NOT NULL,
			outcome TEXT NOT NULL,
			anime_id TEXT,
			http_status INTEGER,
			payload_json TEXT NOT NULL,
			correlation_json TEXT NOT NULL,
			error_code TEXT NOT NULL DEFAULT '',
			response_body TEXT,
			request_headers TEXT,
			response_headers TEXT,
			duration_ms INTEGER
		)`

	mobileRequestCapturesTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_mobile_request_captures_time
		ON mobile_request_captures (captured_at_ms DESC, request_id DESC)`

	mobileRequestCapturesDeviceTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_mobile_request_captures_device_time
		ON mobile_request_captures (device_id, captured_at_ms DESC, request_id DESC)`

	mobileRequestCapturesAnimeTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_mobile_request_captures_anime_time
		ON mobile_request_captures (anime_id, captured_at_ms DESC, request_id DESC)`

	mobileRequestCapturesRouteTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_mobile_request_captures_route_time
		ON mobile_request_captures (route, captured_at_ms DESC, request_id DESC)`

	mobileRequestCapturesStatusTimeIndexDDL = `
		CREATE INDEX IF NOT EXISTS idx_mobile_request_captures_status_time
		ON mobile_request_captures (http_status, captured_at_ms DESC, request_id DESC)`

	mobileRequestCaptureMetadataDDL = `
		CREATE TABLE IF NOT EXISTS mobile_request_capture_metadata (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`
)

// containsSchemaColumn reports whether columns contains want.
func containsSchemaColumn(columns []string, want string) bool {
	for _, column := range columns {
		if column == want {
			return true
		}
	}
	return false
}

// isLegacyAnimeSnapshotsSchema recognizes the original snapshot columns.
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

// isCurrentChangelogSchema reports whether columns satisfy the current changelog shape.
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

// isLegacyPayloadOnlyChangelogSchema recognizes the original payload-only changelog shape.
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

// deriveChangedFieldsJSONFromLegacyPayload extracts changed field names from legacy JSON.
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
