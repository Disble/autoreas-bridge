package sync

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

type ConflictStore struct {
	db *sql.DB
}

func NewConflictStore(db *sql.DB) *ConflictStore {
	return &ConflictStore{db: db}
}

// InsertConflict persists a detected non-blocking sync conflict (SDD-30
// ADR-30-4): both the bridge's local snapshot and the mobile client's
// divergent remote snapshot are stored verbatim, status='pending',
// resolved_at_ms/resolution left NULL. conflict_id is the table's primary
// key (conflictsDDL) -- a duplicate id fails rather than silently
// overwriting an existing pending/resolved conflict.
func (s *ConflictStore) InsertConflict(ctx context.Context, record contracts.ConflictRecord) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO conflicts (
			conflict_id, anime_id, local_snapshot_json, remote_snapshot_json,
			detected_at_ms, status
		) VALUES (?, ?, ?, ?, ?, 'pending')
	`, record.ConflictID, record.AnimeID, record.LocalSnapshotJSON, record.RemoteSnapshotJSON, record.DetectedAtMs)
	if err != nil {
		return fmt.Errorf("insert conflict %q: %w", record.ConflictID, err)
	}
	return nil
}

func (s *ConflictStore) ListConflicts(ctx context.Context) ([]contracts.ConflictInfo, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT conflict_id, anime_id, detected_at_ms, status, local_snapshot_json, remote_snapshot_json
		FROM conflicts
		WHERE status = 'pending'
		ORDER BY detected_at_ms ASC, conflict_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list conflicts: %w", err)
	}
	defer rows.Close()

	conflicts := []contracts.ConflictInfo{}
	for rows.Next() {
		var item contracts.ConflictInfo
		if err := rows.Scan(&item.ConflictID, &item.AnimeID, &item.DetectedAtMs, &item.Status, &item.LocalSnapshotJSON, &item.RemoteSnapshotJSON); err != nil {
			return nil, fmt.Errorf("scan conflict: %w", err)
		}
		conflicts = append(conflicts, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate conflicts: %w", err)
	}
	return conflicts, nil
}

func (s *ConflictStore) ResolveConflict(ctx context.Context, id string, at time.Time) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE conflicts
		SET status = 'resolved', resolved_at_ms = ?, resolution = 'manual'
		WHERE conflict_id = ? AND status = 'pending'
	`, at.UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("resolve conflict %q: %w", id, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("resolve conflict %q rows affected: %w", id, err)
	}
	if rows != 1 {
		return contracts.ErrAnimeNotFound
	}
	return nil
}

var _ contracts.ConflictService = (*ConflictStore)(nil)
