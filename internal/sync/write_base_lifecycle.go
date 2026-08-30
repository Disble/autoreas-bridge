package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"autoreas-bridge/internal/anime"
)

// FinalizeBatch commits every staged operation that belongs to the same replacement batch.
func (s *WriteBaseStore) FinalizeBatch(ctx context.Context, batchID string, committedAtMs int64) (err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin batch finalization %q: %w", batchID, err)
	}
	defer func() { _ = tx.Rollback() }()
	rows, err := tx.QueryContext(ctx, writeOperationSelect+` WHERE batch_id = ? AND status = ? ORDER BY batch_order ASC, operation_id ASC`, batchID, anime.WriteOperationStatusStaged)
	if err != nil {
		return fmt.Errorf("query batch operations %q: %w", batchID, err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close batch operations %q: %w", batchID, closeErr)
		}
	}()
	operations := []anime.WriteOperation{}
	for rows.Next() {
		operation, err := scanWriteOperation(rows)
		if err != nil {
			return fmt.Errorf("scan batch operation %q: %w", batchID, err)
		}
		operations = append(operations, operation)
	}
	if len(operations) == 0 {
		return anime.ErrWriteOperationNotFound
	}
	for _, operation := range operations {
		status, err := finalizeWriteOperation(ctx, tx, operation, committedAtMs)
		if err != nil {
			return err
		}
		if status == anime.WriteOperationStatusSuperseded {
			return anime.ErrWriteOperationSuperseded
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit batch finalization %q: %w", batchID, err)
	}
	return nil
}

// Abort marks one staged write operation as aborted.
func (s *WriteBaseStore) Abort(ctx context.Context, operationID string) error {
	return s.transitionFromStaged(ctx, operationID, anime.WriteOperationStatusAborted)
}

// AbortBatch marks every staged operation in the batch as aborted.
func (s *WriteBaseStore) AbortBatch(ctx context.Context, batchID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE anime_write_operations SET status = ? WHERE batch_id = ? AND status = ?
	`, anime.WriteOperationStatusAborted, batchID, anime.WriteOperationStatusStaged)
	if err != nil {
		return fmt.Errorf("abort batch %q: %w", batchID, err)
	}
	return nil
}

// ListStaged returns staged write operations in deterministic recovery order.
func (s *WriteBaseStore) ListStaged(ctx context.Context) (operations []anime.WriteOperation, err error) {
	rows, err := s.db.QueryContext(ctx, writeOperationSelect+`
		WHERE status = ?
		ORDER BY created_at_ms ASC, batch_id ASC, batch_order ASC, operation_id ASC
	`, anime.WriteOperationStatusStaged)
	if err != nil {
		return nil, fmt.Errorf("list staged write operations: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			operations = nil
			err = fmt.Errorf("close staged write operation rows: %w", closeErr)
		}
	}()

	operations = []anime.WriteOperation{}
	for rows.Next() {
		operation, err := scanWriteOperation(rows)
		if err != nil {
			return nil, fmt.Errorf("scan staged write operation: %w", err)
		}
		operations = append(operations, operation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate staged write operations: %w", err)
	}
	return operations, nil
}

// GetBase returns the retained committed base for one resulting modified_at token.
func (s *WriteBaseStore) GetBase(ctx context.Context, animeID string, resultingModifiedAt int64) (anime.WriteBase, error) {
	var base anime.WriteBase
	var snapshotJSON string
	err := s.db.QueryRowContext(ctx, `
		SELECT operation_id, anime_id, base_modified_at, intended_modified_at,
		       base_snapshot_json, base_hash
		FROM anime_write_operations
		WHERE anime_id = ? AND intended_modified_at = ? AND status = ?
		ORDER BY committed_at_ms DESC, operation_id DESC
		LIMIT 1
	`, animeID, resultingModifiedAt, anime.WriteOperationStatusCommitted).Scan(
		&base.OperationID,
		&base.AnimeID,
		&base.BaseModifiedAt,
		&base.ResultingModifiedAt,
		&snapshotJSON,
		&base.SnapshotHash,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return anime.WriteBase{}, anime.ErrWriteBaseNotFound
	}
	if err != nil {
		return anime.WriteBase{}, fmt.Errorf("query write base for anime %q token %d: %w", animeID, resultingModifiedAt, err)
	}
	base.SnapshotJSON = []byte(snapshotJSON)
	return base, nil
}

// Recover classifies a staged write operation against the effective file hash after restart.
func (s *WriteBaseStore) Recover(ctx context.Context, operationID, effectiveHash string, committedAtMs int64) (anime.WriteRecoveryAction, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin write operation recovery %q: %w", operationID, err)
	}
	defer func() { _ = tx.Rollback() }()

	operation, err := getWriteOperation(ctx, tx, operationID)
	if err != nil {
		return "", err
	}
	if operation.Status != anime.WriteOperationStatusStaged {
		return "", fmt.Errorf("recover write operation %q: %w", operationID, anime.ErrWriteOperationNotStaged)
	}

	switch effectiveHash {
	case operation.DesiredHash:
		status, err := finalizeWriteOperation(ctx, tx, operation, committedAtMs)
		if err != nil {
			return "", err
		}
		if err := tx.Commit(); err != nil {
			return "", fmt.Errorf("commit recovered write operation %q: %w", operationID, err)
		}
		if status == anime.WriteOperationStatusSuperseded {
			return anime.WriteRecoveryActionDivergent, nil
		}
		return anime.WriteRecoveryActionFinalized, nil
	case operation.BaseHash:
		return anime.WriteRecoveryActionRetryAppend, nil
	default:
		if _, err := tx.ExecContext(ctx, `
			UPDATE anime_write_operations
			SET status = ?
			WHERE operation_id = ? AND status = ?
		`, anime.WriteOperationStatusSuperseded, operationID, anime.WriteOperationStatusStaged); err != nil {
			return "", fmt.Errorf("mark divergent write operation %q: %w", operationID, err)
		}
		if err := tx.Commit(); err != nil {
			return "", fmt.Errorf("commit divergent write operation %q: %w", operationID, err)
		}
		return anime.WriteRecoveryActionDivergent, nil
	}
}

// MarkBatchSuperseded marks every staged operation in the batch as superseded.
func (s *WriteBaseStore) MarkBatchSuperseded(ctx context.Context, batchID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE anime_write_operations SET status = ? WHERE batch_id = ? AND status = ?
	`, anime.WriteOperationStatusSuperseded, batchID, anime.WriteOperationStatusStaged)
	if err != nil {
		return fmt.Errorf("mark batch %q superseded: %w", batchID, err)
	}
	return nil
}

// ListPendingAnimeChanged returns unpublished anime.changed outbox rows in publish order.
func (s *WriteBaseStore) ListPendingAnimeChanged(ctx context.Context) (events []anime.ChangedOutboxEvent, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT event_id, operation_id, anime_id, payload_json, changed_fields_json, created_at_ms
		FROM anime_changed_outbox
		WHERE status = 'pending'
		ORDER BY created_at_ms ASC, event_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list pending anime.changed outbox: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			events = nil
			err = fmt.Errorf("close pending anime.changed outbox rows: %w", closeErr)
		}
	}()
	events = []anime.ChangedOutboxEvent{}
	for rows.Next() {
		var event anime.ChangedOutboxEvent
		var payload string
		var changedFields sql.NullString
		if err := rows.Scan(&event.EventID, &event.OperationID, &event.AnimeID, &payload, &changedFields, &event.CreatedAtMs); err != nil {
			return nil, fmt.Errorf("scan pending anime.changed outbox: %w", err)
		}
		event.Payload = []byte(payload)
		event.ChangedFields, err = unmarshalDerivedChangedFields(changedFields)
		if err != nil {
			return nil, fmt.Errorf("read changed fields for anime.changed outbox event %q: %w", event.EventID, err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending anime.changed outbox: %w", err)
	}
	return events, nil
}

// MarkAnimeChangedPublished marks one anime.changed outbox row as published.
func (s *WriteBaseStore) MarkAnimeChangedPublished(ctx context.Context, eventID string, publishedAtMs int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE anime_changed_outbox
		SET status = 'published', published_at_ms = ?
		WHERE event_id = ? AND status = 'pending'
	`, publishedAtMs, eventID)
	if err != nil {
		return fmt.Errorf("mark anime.changed outbox event %q published: %w", eventID, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read anime.changed outbox event %q mark result: %w", eventID, err)
	}
	if rows == 1 {
		return nil
	}
	var status string
	err = s.db.QueryRowContext(ctx, `SELECT status FROM anime_changed_outbox WHERE event_id = ?`, eventID).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return anime.ErrAnimeChangedOutboxEventNotFound
	}
	if err != nil {
		return fmt.Errorf("query anime.changed outbox event %q after mark: %w", eventID, err)
	}
	if status == "published" {
		return nil
	}
	return fmt.Errorf("mark anime.changed outbox event %q from status %q", eventID, status)
}
