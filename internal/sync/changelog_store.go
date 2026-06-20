package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

type ChangelogStore struct {
	sqliteStore
}

func NewChangelogStore(provider SyncSQLiteProvider) *ChangelogStore {
	return &ChangelogStore{sqliteStore: newSQLiteStore(provider)}
}

func (s *ChangelogStore) InsertPending(ctx context.Context, entry ChangelogEntry) error {
	entry = normalizePendingChangelogEntry(entry)

	if _, err := s.execContext(ctx, `
		INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES (?, ?, ?, ?, ?, ?)
	`, entry.AnimeID, entry.ChangeType, marshalChangedFields(entry.ChangedFields), string(entry.SnapshotJSON), entry.Status, entry.ChangedAtMs); err != nil {
		return fmt.Errorf("insert changelog pending for %q: %w", entry.AnimeID, err)
	}

	return nil
}

func (s *ChangelogStore) ListSinceTimestamp(ctx context.Context, sinceMs int64) ([]ChangelogEntry, error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms
		FROM changelog
		WHERE changed_at_ms > ?
		ORDER BY id ASC
	`, sinceMs)
	if err != nil {
		return nil, fmt.Errorf("list changelog since timestamp %d: %w", sinceMs, err)
	}
	defer rows.Close()
	return scanChangelogEntries(rows)
}

func (s *ChangelogStore) ListAfterID(ctx context.Context, lastID int64) ([]ChangelogEntry, error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms
		FROM changelog
		WHERE id > ?
		ORDER BY id ASC
	`, lastID)
	if err != nil {
		return nil, fmt.Errorf("list changelog after id %d: %w", lastID, err)
	}
	defer rows.Close()
	return scanChangelogEntries(rows)
}

func (s *ChangelogStore) ListPending(ctx context.Context) ([]ChangelogEntry, error) {
	rows, err := s.provider.DB().QueryContext(ctx, `
		SELECT id, anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms
		FROM changelog
		WHERE status = ?
		ORDER BY changed_at_ms DESC, id DESC
	`, changelogStatusPending)
	if err != nil {
		return nil, fmt.Errorf("list pending changelog rows: %w", err)
	}
	defer rows.Close()
	return scanChangelogEntries(rows)
}

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

func scanChangelogEntries(rows *sql.Rows) ([]ChangelogEntry, error) {
	entries := []ChangelogEntry{}
	for rows.Next() {
		var entry ChangelogEntry
		var changedFieldsJSON string
		var snapshotJSON sql.NullString
		if err := rows.Scan(&entry.ID, &entry.AnimeID, &entry.ChangeType, &changedFieldsJSON, &snapshotJSON, &entry.Status, &entry.ChangedAtMs); err != nil {
			return nil, fmt.Errorf("scan changelog entry: %w", err)
		}
		if err := json.Unmarshal([]byte(changedFieldsJSON), &entry.ChangedFields); err != nil {
			return nil, fmt.Errorf("decode changed fields json: %w", err)
		}
		if snapshotJSON.Valid {
			entry.SnapshotJSON = []byte(snapshotJSON.String)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate changelog entries: %w", err)
	}
	return entries, nil
}
