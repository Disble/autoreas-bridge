package sync

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

// ConflictStore persists pending and resolved sync-conflict records.
type ConflictStore struct {
	db *sql.DB
}

// NewConflictStore builds the SQLite-backed sync conflict store.
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

// ListConflicts returns pending conflicts ordered by detection time.
func (s *ConflictStore) ListConflicts(ctx context.Context) (conflicts []contracts.ConflictInfo, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT conflict_id, anime_id, detected_at_ms, status, local_snapshot_json, remote_snapshot_json
		FROM conflicts
		WHERE status = 'pending'
		ORDER BY detected_at_ms ASC, conflict_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list conflicts: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			conflicts = nil
			err = fmt.Errorf("close conflict rows: %w", closeErr)
		}
	}()

	conflicts = []contracts.ConflictInfo{}
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

// ResolveConflict marks one pending conflict as manually resolved.
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
