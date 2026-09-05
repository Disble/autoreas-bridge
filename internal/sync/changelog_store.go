package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// ChangelogStore persists anime changelog rows and device acknowledgement state.
type ChangelogStore struct {
	sqliteStore
}

// NewChangelogStore builds the SQLite-backed changelog store.
func NewChangelogStore(provider SQLiteProvider) *ChangelogStore {
	return &ChangelogStore{sqliteStore: newSQLiteStore(provider)}
}

// InsertPending stores a changelog row that still needs to reach paired devices.
func (s *ChangelogStore) InsertPending(ctx context.Context, entry ChangelogEntry) error {
	entry = normalizePendingChangelogEntry(entry)

	if _, err := s.execContext(ctx, `
		INSERT INTO changelog (
			anime_id, change_type, changed_fields_json, snapshot_json,
			source_event_id, status, changed_at_ms
		)
		VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?)
		ON CONFLICT(source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING
	`, entry.AnimeID, entry.ChangeType, marshalChangedFields(entry.ChangedFields), string(entry.SnapshotJSON), entry.SourceEventID, entry.Status, entry.ChangedAtMs); err != nil {
		return fmt.Errorf("insert changelog pending for %q: %w", entry.AnimeID, err)
	}

	return nil
}

// ListSinceTimestamp returns changelog rows newer than the given timestamp.
func (s *ChangelogStore) ListSinceTimestamp(ctx context.Context, sinceMs int64) ([]ChangelogEntry, error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, change_type, changed_fields_json, snapshot_json, source_event_id, status, changed_at_ms
		FROM changelog
		WHERE changed_at_ms > ?
		ORDER BY id ASC
	`, sinceMs)
	if err != nil {
		return nil, fmt.Errorf("list changelog since timestamp %d: %w", sinceMs, err)
	}
	return scanAndCloseChangelogEntries(rows)
}

// ListAfterID returns changelog rows whose ids are greater than lastID.
func (s *ChangelogStore) ListAfterID(ctx context.Context, lastID int64) ([]ChangelogEntry, error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, change_type, changed_fields_json, snapshot_json, source_event_id, status, changed_at_ms
		FROM changelog
		WHERE id > ?
		ORDER BY id ASC
	`, lastID)
	if err != nil {
		return nil, fmt.Errorf("list changelog after id %d: %w", lastID, err)
	}
	return scanAndCloseChangelogEntries(rows)
}

// ListPending returns all changelog rows that still await device delivery.
func (s *ChangelogStore) ListPending(ctx context.Context) ([]ChangelogEntry, error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, change_type, changed_fields_json, snapshot_json, source_event_id, status, changed_at_ms
		FROM changelog
		WHERE status = ?
		ORDER BY changed_at_ms DESC, id DESC
	`, changelogStatusPending)
	if err != nil {
		return nil, fmt.Errorf("list pending changelog rows: %w", err)
	}
	return scanAndCloseChangelogEntries(rows)
}

// LastID returns the latest changelog id, or zero when no rows exist.
func (s *ChangelogStore) LastID(ctx context.Context) (int64, error) {
	var lastID sql.NullInt64
	if err := s.provider.DB().QueryRowContext(ctx, `SELECT MAX(id) FROM changelog`).Scan(&lastID); err != nil {
		return 0, fmt.Errorf("query last changelog id: %w", err)
	}
	if !lastID.Valid {
		return 0, nil
	}
	return lastID.Int64, nil
}

// LastChangedAt returns the newest changelog timestamp, or nil when no rows exist.
func (s *ChangelogStore) LastChangedAt(ctx context.Context) (*int64, error) {
	var lastChanged sql.NullInt64
	if err := s.provider.DB().QueryRowContext(ctx, `SELECT MAX(changed_at_ms) FROM changelog`).Scan(&lastChanged); err != nil {
		return nil, fmt.Errorf("query last changelog timestamp: %w", err)
	}
	if !lastChanged.Valid {
		return nil, nil
	}
	value := lastChanged.Int64
	return &value, nil
}

// AcknowledgeDevice records the latest changelog seen by a paired device.
func (s *ChangelogStore) AcknowledgeDevice(ctx context.Context, deviceID string, lastAckChangelogID, lastSeenAtMs int64) error {
	if deviceID == "" {
		return fmt.Errorf("acknowledge device: device id is required")
	}
	if lastAckChangelogID < 0 {
		lastAckChangelogID = 0
	}
	if _, err := s.execContext(ctx, `
		INSERT INTO device_sync_state (device_id, last_ack_changelog_id, last_seen_at_ms, sync_status)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(device_id) DO UPDATE SET
			last_ack_changelog_id = MAX(device_sync_state.last_ack_changelog_id, excluded.last_ack_changelog_id),
			last_seen_at_ms = excluded.last_seen_at_ms,
			sync_status = ?
	`, deviceID, lastAckChangelogID, lastSeenAtMs, DeviceSyncStatusActive, DeviceSyncStatusActive); err != nil {
		return fmt.Errorf("acknowledge device %q: %w", deviceID, err)
	}
	return nil
}

// SetDeviceSyncStatus updates the persisted sync-health state for one device.
func (s *ChangelogStore) SetDeviceSyncStatus(ctx context.Context, deviceID, status string) error {
	if deviceID == "" {
		return fmt.Errorf("set device sync status: device id is required")
	}
	if status == "" {
		status = DeviceSyncStatusActive
	}
	if _, err := s.execContext(ctx, `
		UPDATE device_sync_state
		SET sync_status = ?
		WHERE device_id = ?
	`, status, deviceID); err != nil {
		return fmt.Errorf("set device sync status for %q: %w", deviceID, err)
	}
	return nil
}

// MarkDeviceRevoked marks a device as revoked and records the revocation timestamp.
func (s *ChangelogStore) MarkDeviceRevoked(ctx context.Context, deviceID string, atMs int64) error {
	if deviceID == "" {
		return fmt.Errorf("mark device revoked: device id is required")
	}
	if _, err := s.execContext(ctx, `
		INSERT INTO device_sync_state (device_id, last_ack_changelog_id, last_seen_at_ms, sync_status)
		VALUES (?, 0, ?, ?)
		ON CONFLICT(device_id) DO UPDATE SET
			last_seen_at_ms = excluded.last_seen_at_ms,
			sync_status = excluded.sync_status
	`, deviceID, atMs, DeviceSyncStatusRevoked); err != nil {
		return fmt.Errorf("mark device revoked %q: %w", deviceID, err)
	}
	return nil
}

// PruneAcknowledgedChangelog deletes changelog rows acknowledged by every active device.
func (s *ChangelogStore) PruneAcknowledgedChangelog(ctx context.Context) (int64, error) {
	var minAck sql.NullInt64
	if err := s.provider.DB().QueryRowContext(ctx, `
		SELECT MIN(last_ack_changelog_id)
		FROM device_sync_state
		WHERE sync_status = ?
	`, DeviceSyncStatusActive).Scan(&minAck); err != nil {
		return 0, fmt.Errorf("query min active device ack: %w", err)
	}
	if !minAck.Valid || minAck.Int64 <= 0 {
		return 0, nil
	}
	result, err := s.execContext(ctx, `DELETE FROM changelog WHERE id <= ?`, minAck.Int64)
	if err != nil {
		return 0, fmt.Errorf("prune acknowledged changelog <= %d: %w", minAck.Int64, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("prune acknowledged changelog rows affected: %w", err)
	}
	return rows, nil
}

// ListDeviceSyncStates returns every persisted device sync-health row.
func (s *ChangelogStore) ListDeviceSyncStates(ctx context.Context) (states []DeviceSyncState, err error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT device_id, last_ack_changelog_id, last_seen_at_ms, sync_status
		FROM device_sync_state
		ORDER BY last_seen_at_ms DESC, device_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list device sync states: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			states = nil
			err = fmt.Errorf("close device sync state rows: %w", closeErr)
		}
	}()

	states = []DeviceSyncState{}
	for rows.Next() {
		var state DeviceSyncState
		if err := rows.Scan(&state.DeviceID, &state.LastAckChangelogID, &state.LastSeenAtMs, &state.SyncStatus); err != nil {
			return nil, fmt.Errorf("scan device sync state: %w", err)
		}
		state.BlocksChangelogPrune = state.SyncStatus == DeviceSyncStatusActive
		states = append(states, state)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate device sync states: %w", err)
	}
	return states, nil
}

// EvaluateDeviceStaleness classifies every device using the given stale thresholds.
func (s *ChangelogStore) EvaluateDeviceStaleness(ctx context.Context, nowMs, staleAfterMs, warnBeforeStaleMs int64) (states []DeviceSyncState, err error) {
	staleCutoff := nowMs - staleAfterMs
	warningCutoff := staleCutoff + warnBeforeStaleMs

	if _, err := s.execContext(ctx, `
		UPDATE device_sync_state
		SET sync_status = ?
		WHERE sync_status IN (?, ?)
		  AND last_seen_at_ms <= ?
	`, DeviceSyncStatusStale, DeviceSyncStatusActive, DeviceSyncStatusWarning, staleCutoff); err != nil {
		return nil, fmt.Errorf("mark stale device sync states: %w", err)
	}

	if _, err := s.execContext(ctx, `
		UPDATE device_sync_state
		SET sync_status = ?
		WHERE sync_status = ?
		  AND last_seen_at_ms <= ?
		  AND last_seen_at_ms > ?
	`, DeviceSyncStatusWarning, DeviceSyncStatusActive, warningCutoff, staleCutoff); err != nil {
		return nil, fmt.Errorf("mark warning device sync states: %w", err)
	}

	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT device_id, last_ack_changelog_id, last_seen_at_ms, sync_status
		FROM device_sync_state
		WHERE sync_status IN (?, ?)
		  AND last_seen_at_ms <= ?
		ORDER BY last_seen_at_ms ASC, device_id ASC
	`, DeviceSyncStatusWarning, DeviceSyncStatusStale, warningCutoff)
	if err != nil {
		return nil, fmt.Errorf("list changed device sync health states: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			states = nil
			err = fmt.Errorf("close changed device sync state rows: %w", closeErr)
		}
	}()

	states = []DeviceSyncState{}
	for rows.Next() {
		var state DeviceSyncState
		if err := rows.Scan(&state.DeviceID, &state.LastAckChangelogID, &state.LastSeenAtMs, &state.SyncStatus); err != nil {
			return nil, fmt.Errorf("scan changed device sync health state: %w", err)
		}
		state.BlocksChangelogPrune = state.SyncStatus == DeviceSyncStatusActive
		states = append(states, state)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate changed device sync health states: %w", err)
	}
	return states, nil
}

// scanChangelogEntries reads changelog entries from rows.
func scanChangelogEntries(rows *sql.Rows) ([]ChangelogEntry, error) {
	entries := []ChangelogEntry{}
	for rows.Next() {
		var entry ChangelogEntry
		var changedFieldsJSON string
		var snapshotJSON sql.NullString
		var sourceEventID sql.NullString
		if err := rows.Scan(&entry.ID, &entry.AnimeID, &entry.ChangeType, &changedFieldsJSON, &snapshotJSON, &sourceEventID, &entry.Status, &entry.ChangedAtMs); err != nil {
			return nil, fmt.Errorf("scan changelog entry: %w", err)
		}
		if err := json.Unmarshal([]byte(changedFieldsJSON), &entry.ChangedFields); err != nil {
			return nil, fmt.Errorf("decode changed fields json: %w", err)
		}
		if snapshotJSON.Valid {
			entry.SnapshotJSON = []byte(snapshotJSON.String)
		}
		if sourceEventID.Valid {
			entry.SourceEventID = sourceEventID.String
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate changelog entries: %w", err)
	}
	return entries, nil
}

// scanAndCloseChangelogEntries reads and closes changelog rows.
func scanAndCloseChangelogEntries(rows *sql.Rows) ([]ChangelogEntry, error) {
	entries, err := scanChangelogEntries(rows)
	if closeErr := rows.Close(); closeErr != nil {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("close changelog rows: %w", closeErr)
	}
	return entries, err
}
