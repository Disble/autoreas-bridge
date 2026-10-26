package sync

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/persistence"
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

// deriveChangeType reports whether a write creates or updates its anime. It
// must run inside the finalize transaction BEFORE the snapshot upsert: the only
// reliable sign of a create is that the database held no row for the anime
// when the write committed. The write's base snapshot cannot tell, because a
// create's synthesized base is a bare {"id":...} object, not an absent one.
func deriveChangeType(ctx context.Context, tx persistence.Querier, animeID string) (string, error) {
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM anime_snapshots WHERE anime_id = ?)`, animeID).Scan(&exists); err != nil {
		return "", err
	}
	if exists {
		return ChangelogTypeUpdate, nil
	}
	return ChangelogTypeCreate, nil
}

// insertAnimeChangedOutbox queues the committed anime change for publication.
//
// This is where the changed-field set is derived. The transaction holds both
// the base and the desired snapshot, and it is the single choke point every
// committed write passes through, so the list is computed once from the two
// states rather than declared by whichever service happened to publish. The
// change type comes from the same transaction (deriveChangeType).
func insertAnimeChangedOutbox(ctx context.Context, tx *sql.Tx, operation anime.WriteOperation, changeType string, committedAtMs int64) error {
	changedFields, err := deriveChangedFields(operation.BaseSnapshotJSON, operation.DesiredSnapshotJSON)
	if err != nil {
		return fmt.Errorf("derive changed fields for write operation %q: %w", operation.OperationID, err)
	}
	encodedFields, err := marshalDerivedChangedFields(changedFields)
	if err != nil {
		return fmt.Errorf("encode changed fields for write operation %q: %w", operation.OperationID, err)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO anime_changed_outbox (event_id, operation_id, anime_id, payload_json, changed_fields_json, change_type, status, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, operation.OperationID, operation.OperationID, operation.AnimeID, string(operation.DesiredSnapshotJSON), encodedFields, changeType, committedAtMs)
	if err != nil {
		return fmt.Errorf("insert anime.changed outbox for write operation %q: %w", operation.OperationID, err)
	}
	return nil
}
