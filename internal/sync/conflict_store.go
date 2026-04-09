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

func (s *ConflictStore) ListConflicts(ctx context.Context) ([]contracts.ConflictInfo, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT conflict_id, anime_id, detected_at_ms, status
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
		if err := rows.Scan(&item.ConflictID, &item.AnimeID, &item.DetectedAtMs, &item.Status); err != nil {
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
