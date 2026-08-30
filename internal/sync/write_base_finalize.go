package sync

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/anime"
)

// updateWriteOperationStatus records the terminal status of a staged operation.
func updateWriteOperationStatus(ctx context.Context, tx *sql.Tx, operation anime.WriteOperation, status anime.WriteOperationStatus, committedAtMs int64) error {
	var committedAt any = committedAtMs
	if status == anime.WriteOperationStatusSuperseded {
		committedAt = nil
	}
	result, err := tx.ExecContext(ctx, `UPDATE anime_write_operations SET status = ?, committed_at_ms = ? WHERE operation_id = ? AND status = ?`, status, committedAt, operation.OperationID, anime.WriteOperationStatusStaged)
	if err != nil {
		return fmt.Errorf("finalize write operation %q: %w", operation.OperationID, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read write operation %q finalization result: %w", operation.OperationID, err)
	}
	if rows != 1 {
		return fmt.Errorf("finalize write operation %q: %w", operation.OperationID, anime.ErrWriteOperationNotStaged)
	}
	return nil
}

// insertAnimeChangedOutbox queues the committed anime change for publication.
//
// This is where the changed-field set is derived. The transaction holds both
// the base and the desired snapshot, and it is the single choke point every
// committed write passes through, so the list is computed once from the two
// states rather than declared by whichever service happened to publish.
func insertAnimeChangedOutbox(ctx context.Context, tx *sql.Tx, operation anime.WriteOperation, committedAtMs int64) error {
	changedFields, err := deriveChangedFields(operation.BaseSnapshotJSON, operation.DesiredSnapshotJSON)
	if err != nil {
		return fmt.Errorf("derive changed fields for write operation %q: %w", operation.OperationID, err)
	}
	encodedFields, err := marshalDerivedChangedFields(changedFields)
	if err != nil {
		return fmt.Errorf("encode changed fields for write operation %q: %w", operation.OperationID, err)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO anime_changed_outbox (event_id, operation_id, anime_id, payload_json, changed_fields_json, status, created_at_ms) VALUES (?, ?, ?, ?, ?, 'pending', ?)`, operation.OperationID, operation.OperationID, operation.AnimeID, string(operation.DesiredSnapshotJSON), encodedFields, committedAtMs)
	if err != nil {
		return fmt.Errorf("insert anime.changed outbox for write operation %q: %w", operation.OperationID, err)
	}
	return nil
}
