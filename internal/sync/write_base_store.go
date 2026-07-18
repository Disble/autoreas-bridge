package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"autoreas-bridge/internal/anime"
)

// WriteBaseStore persists staged write operations, retained bases, and publish outbox rows.
type WriteBaseStore struct {
	db *sql.DB
}

// NewWriteBaseStore builds the SQLite-backed write-base store.
func NewWriteBaseStore(db *sql.DB) *WriteBaseStore {
	return &WriteBaseStore{db: db}
}

// Stage reserves an anime write operation when its current base token still matches.
func (s *WriteBaseStore) Stage(ctx context.Context, operation anime.WriteOperation) error {
	if operation.BatchSize <= 0 {
		operation.BatchSize = 1
	}
	if err := validateWriteOperation(operation); err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx, `
		INSERT INTO anime_write_operations (
			operation_id, anime_id, batch_id, batch_order, batch_size, base_modified_at, intended_modified_at,
			base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
			status, created_at_ms
		)
		SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		WHERE COALESCE((
			SELECT modified_at FROM anime_snapshots WHERE anime_id = ?
		), 0) = ?
		AND NOT EXISTS (
			SELECT 1 FROM anime_write_operations
			WHERE anime_id = ? AND status = ?
		)
	`,
		operation.OperationID,
		operation.AnimeID,
		operation.BatchID,
		operation.BatchOrder,
		operation.BatchSize,
		operation.BaseModifiedAt,
		operation.IntendedModifiedAt,
		string(operation.BaseSnapshotJSON),
		operation.BaseHash,
		string(operation.DesiredSnapshotJSON),
		operation.DesiredHash,
		anime.WriteOperationStatusStaged,
		operation.CreatedAtMs,
		operation.AnimeID,
		operation.BaseModifiedAt,
		operation.AnimeID,
		anime.WriteOperationStatusStaged,
	)
	if err != nil {
		if classified := s.classifyStageRejection(ctx, operation); classified != nil {
			return classified
		}
		return fmt.Errorf("stage write operation %q: %w", operation.OperationID, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read staged write operation %q result: %w", operation.OperationID, err)
	}
	if rows != 1 {
		if classified := s.classifyStageRejection(ctx, operation); classified != nil {
			return classified
		}
		return fmt.Errorf("stage write operation %q: insert preconditions were not met", operation.OperationID)
	}
	return nil
}

// classifyStageRejection identifies the precondition that rejected staging.
func (s *WriteBaseStore) classifyStageRejection(ctx context.Context, operation anime.WriteOperation) error {
	return classifyStageRejectionWithQuerier(ctx, s.db, operation)
}

// classifyStageRejectionWithQuerier checks the current base and live reservation.
func classifyStageRejectionWithQuerier(ctx context.Context, queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, operation anime.WriteOperation) error {
	var currentModifiedAt int64
	err := queryer.QueryRowContext(ctx, `
		SELECT COALESCE((SELECT modified_at FROM anime_snapshots WHERE anime_id = ?), 0)
	`, operation.AnimeID).Scan(&currentModifiedAt)
	if err != nil {
		return fmt.Errorf("query current base for anime %q: %w", operation.AnimeID, err)
	}
	if currentModifiedAt != operation.BaseModifiedAt {
		return fmt.Errorf("stage write operation %q at base %d while current is %d: %w",
			operation.OperationID, operation.BaseModifiedAt, currentModifiedAt, anime.ErrWriteBaseChanged)
	}

	var reservationID string
	err = queryer.QueryRowContext(ctx, `
		SELECT operation_id FROM anime_write_operations
		WHERE anime_id = ? AND status = ?
		LIMIT 1
	`, operation.AnimeID, anime.WriteOperationStatusStaged).Scan(&reservationID)
	if err == nil {
		return fmt.Errorf("stage write operation %q while %q reserves anime %q: %w",
			operation.OperationID, reservationID, operation.AnimeID, anime.ErrWriteReservationBusy)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("query live write reservation for anime %q: %w", operation.AnimeID, err)
	}
	return nil
}

// StageBatch stages a replacement batch atomically when every operation still matches its base.
func (s *WriteBaseStore) StageBatch(ctx context.Context, operations []anime.WriteOperation) error {
	if len(operations) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin batch stage: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, operation := range operations {
		if operation.BatchSize <= 0 {
			operation.BatchSize = len(operations)
		}
		if err := validateWriteOperation(operation); err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `
			INSERT INTO anime_write_operations (
				operation_id, anime_id, batch_id, batch_order, batch_size, base_modified_at, intended_modified_at,
				base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
				status, created_at_ms
			)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			WHERE COALESCE((SELECT modified_at FROM anime_snapshots WHERE anime_id = ?), 0) = ?
			AND NOT EXISTS (
				SELECT 1 FROM anime_write_operations WHERE anime_id = ? AND status = ?
			)
		`, operation.OperationID, operation.AnimeID, operation.BatchID, operation.BatchOrder, operation.BatchSize,
			operation.BaseModifiedAt, operation.IntendedModifiedAt, string(operation.BaseSnapshotJSON), operation.BaseHash,
			string(operation.DesiredSnapshotJSON), operation.DesiredHash, anime.WriteOperationStatusStaged, operation.CreatedAtMs,
			operation.AnimeID, operation.BaseModifiedAt, operation.AnimeID, anime.WriteOperationStatusStaged)
		if err != nil {
			return fmt.Errorf("stage batch write operation %q: %w", operation.OperationID, err)
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read staged batch write operation %q result: %w", operation.OperationID, err)
		}
		if rows != 1 {
			return classifyStageRejectionWithQuerier(ctx, tx, operation)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit batch stage: %w", err)
	}
	return nil
}

// Finalize commits a staged write operation's desired snapshot and retained base.
func (s *WriteBaseStore) Finalize(ctx context.Context, operationID string, committedAtMs int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin write operation finalization %q: %w", operationID, err)
	}
	defer func() { _ = tx.Rollback() }()

	operation, err := getWriteOperation(ctx, tx, operationID)
	if err != nil {
		return err
	}
	if operation.Status == anime.WriteOperationStatusCommitted {
		return nil
	}
	if operation.Status != anime.WriteOperationStatusStaged {
		return fmt.Errorf("finalize write operation %q: %w", operationID, anime.ErrWriteOperationNotStaged)
	}
	status, err := finalizeWriteOperation(ctx, tx, operation, committedAtMs)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit write operation finalization %q: %w", operationID, err)
	}
	if status == anime.WriteOperationStatusSuperseded {
		return fmt.Errorf("finalize write operation %q: %w", operationID, anime.ErrWriteOperationSuperseded)
	}
	return nil
}

// transitionFromStaged moves a staged operation to target status.
func (s *WriteBaseStore) transitionFromStaged(ctx context.Context, operationID string, target anime.WriteOperationStatus) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE anime_write_operations
		SET status = ?
		WHERE operation_id = ? AND status = ?
	`, target, operationID, anime.WriteOperationStatusStaged)
	if err != nil {
		return fmt.Errorf("mark write operation %q %s: %w", operationID, target, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read write operation %q transition result: %w", operationID, err)
	}
	if rows == 1 {
		return nil
	}

	var status string
	err = s.db.QueryRowContext(ctx, `SELECT status FROM anime_write_operations WHERE operation_id = ?`, operationID).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return anime.ErrWriteOperationNotFound
	}
	if err != nil {
		return fmt.Errorf("query write operation %q after transition: %w", operationID, err)
	}
	if anime.WriteOperationStatus(status) == target {
		return nil
	}
	return anime.ErrWriteOperationNotStaged
}

// finalizeWriteOperation persists the desired snapshot and publication outbox row.
func finalizeWriteOperation(ctx context.Context, tx *sql.Tx, operation anime.WriteOperation, committedAtMs int64) (anime.WriteOperationStatus, error) {
	result, err := tx.ExecContext(ctx, `
		INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(anime_id) DO UPDATE SET
			snapshot_json = excluded.snapshot_json,
			snapshot_hash = excluded.snapshot_hash,
			modified_at = excluded.modified_at
		WHERE anime_snapshots.modified_at < excluded.modified_at
	`, operation.AnimeID, string(operation.DesiredSnapshotJSON), operation.DesiredHash, operation.IntendedModifiedAt)
	if err != nil {
		return "", fmt.Errorf("finalize anime snapshot for write operation %q: %w", operation.OperationID, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("read anime snapshot finalization result for write operation %q: %w", operation.OperationID, err)
	}

	status := anime.WriteOperationStatusCommitted
	if rows == 0 {
		var currentHash string
		var currentModifiedAt int64
		if err := tx.QueryRowContext(ctx, `
			SELECT snapshot_hash, modified_at
			FROM anime_snapshots
			WHERE anime_id = ?
		`, operation.AnimeID).Scan(&currentHash, &currentModifiedAt); err != nil {
			return "", fmt.Errorf("query authoritative snapshot for write operation %q: %w", operation.OperationID, err)
		}
		if currentModifiedAt != operation.IntendedModifiedAt || currentHash != operation.DesiredHash {
			status = anime.WriteOperationStatusSuperseded
		}
	}

	if err := updateWriteOperationStatus(ctx, tx, operation, status, committedAtMs); err != nil {
		return "", err
	}
	if status == anime.WriteOperationStatusCommitted {
		if err := insertAnimeChangedOutbox(ctx, tx, operation, committedAtMs); err != nil {
			return "", err
		}
	}
	return status, nil
}

const writeOperationSelect = `
	SELECT operation_id, anime_id, batch_id, batch_order, batch_size, base_modified_at, intended_modified_at,
	       base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
	       status, created_at_ms, committed_at_ms
	FROM anime_write_operations
`

type writeOperationScanner interface {
	Scan(dest ...any) error
}

// getWriteOperation loads one write operation by identifier.
func getWriteOperation(ctx context.Context, queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, operationID string) (anime.WriteOperation, error) {
	operation, err := scanWriteOperation(queryer.QueryRowContext(ctx, writeOperationSelect+` WHERE operation_id = ?`, operationID))
	if errors.Is(err, sql.ErrNoRows) {
		return anime.WriteOperation{}, anime.ErrWriteOperationNotFound
	}
	if err != nil {
		return anime.WriteOperation{}, fmt.Errorf("query write operation %q: %w", operationID, err)
	}
	return operation, nil
}

// scanWriteOperation decodes a write operation from a scanner.
func scanWriteOperation(scanner writeOperationScanner) (anime.WriteOperation, error) {
	var operation anime.WriteOperation
	var baseJSON, desiredJSON, status string
	var committedAt sql.NullInt64
	if err := scanner.Scan(
		&operation.OperationID,
		&operation.AnimeID,
		&operation.BatchID,
		&operation.BatchOrder,
		&operation.BatchSize,
		&operation.BaseModifiedAt,
		&operation.IntendedModifiedAt,
		&baseJSON,
		&operation.BaseHash,
		&desiredJSON,
		&operation.DesiredHash,
		&status,
		&operation.CreatedAtMs,
		&committedAt,
	); err != nil {
		return anime.WriteOperation{}, err
	}
	operation.BaseSnapshotJSON = []byte(baseJSON)
	operation.DesiredSnapshotJSON = []byte(desiredJSON)
	operation.Status = anime.WriteOperationStatus(status)
	if committedAt.Valid {
		value := committedAt.Int64
		operation.CommittedAtMs = &value
	}
	return operation, nil
}

// validateWriteOperation checks the required write operation fields.
func validateWriteOperation(operation anime.WriteOperation) error {
	if strings.TrimSpace(operation.OperationID) == "" {
		return errors.New("stage write operation: operation id is required")
	}
	if strings.TrimSpace(operation.AnimeID) == "" {
		return errors.New("stage write operation: anime id is required")
	}
	if !json.Valid(operation.BaseSnapshotJSON) {
		return fmt.Errorf("stage write operation %q: base snapshot is not valid JSON", operation.OperationID)
	}
	if strings.TrimSpace(operation.BaseHash) == "" {
		return fmt.Errorf("stage write operation %q: base hash is required", operation.OperationID)
	}
	if !json.Valid(operation.DesiredSnapshotJSON) {
		return fmt.Errorf("stage write operation %q: desired snapshot is not valid JSON", operation.OperationID)
	}
	if strings.TrimSpace(operation.DesiredHash) == "" {
		return fmt.Errorf("stage write operation %q: desired hash is required", operation.OperationID)
	}
	return nil
}

var _ anime.WriteBaseStore = (*WriteBaseStore)(nil)
