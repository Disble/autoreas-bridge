package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"autoreas-bridge/internal/anime"
)

func (s *WriteBaseStore) StageBatchReplacement(ctx context.Context, journal anime.BatchReplacementJournal) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO anime_batch_replacements (
			batch_id, canonical_path, temp_path, backup_path, base_file_hash,
			desired_file_hash, phase, created_at_ms, updated_at_ms
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(batch_id) DO UPDATE SET
			canonical_path = excluded.canonical_path,
			temp_path = excluded.temp_path,
			backup_path = excluded.backup_path,
			base_file_hash = excluded.base_file_hash,
			desired_file_hash = excluded.desired_file_hash,
			phase = excluded.phase,
			updated_at_ms = excluded.updated_at_ms
	`, journal.BatchID, journal.CanonicalPath, journal.TempPath, journal.BackupPath,
		journal.BaseFileHash, journal.DesiredFileHash, journal.Phase, journal.CreatedAtMs, journal.UpdatedAtMs)
	if err != nil {
		return fmt.Errorf("stage batch replacement %q: %w", journal.BatchID, err)
	}
	return nil
}

func (s *WriteBaseStore) UpdateBatchReplacementPhase(ctx context.Context, batchID string, phase anime.BatchReplacementPhase, updatedAtMs int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE anime_batch_replacements SET phase = ?, updated_at_ms = ? WHERE batch_id = ?
	`, phase, updatedAtMs, batchID)
	if err != nil {
		return fmt.Errorf("update batch replacement %q phase: %w", batchID, err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return fmt.Errorf("update batch replacement %q phase: journal not found", batchID)
	}
	return nil
}

func (s *WriteBaseStore) GetBatchReplacement(ctx context.Context, batchID string) (anime.BatchReplacementJournal, error) {
	var journal anime.BatchReplacementJournal
	var phase string
	err := s.db.QueryRowContext(ctx, `
		SELECT batch_id, canonical_path, temp_path, backup_path, base_file_hash,
		       desired_file_hash, phase, created_at_ms, updated_at_ms
		FROM anime_batch_replacements WHERE batch_id = ?
	`, batchID).Scan(&journal.BatchID, &journal.CanonicalPath, &journal.TempPath, &journal.BackupPath,
		&journal.BaseFileHash, &journal.DesiredFileHash, &phase, &journal.CreatedAtMs, &journal.UpdatedAtMs)
	if errors.Is(err, sql.ErrNoRows) {
		return anime.BatchReplacementJournal{}, anime.ErrWriteOperationNotFound
	}
	if err != nil {
		return anime.BatchReplacementJournal{}, fmt.Errorf("get batch replacement %q: %w", batchID, err)
	}
	journal.Phase = anime.BatchReplacementPhase(phase)
	return journal, nil
}
