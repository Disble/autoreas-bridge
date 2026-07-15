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

type WriteBaseStore struct {
	db *sql.DB
}

func NewWriteBaseStore(db *sql.DB) *WriteBaseStore {
	return &WriteBaseStore{db: db}
}

func (s *WriteBaseStore) Stage(ctx context.Context, operation anime.WriteOperation) error {
	if err := validateWriteOperation(operation); err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx, `
		INSERT INTO anime_write_operations (
			operation_id, anime_id, base_modified_at, intended_modified_at,
			base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
			status, created_at_ms
		)
		SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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

func (s *WriteBaseStore) classifyStageRejection(ctx context.Context, operation anime.WriteOperation) error {
	var currentModifiedAt int64
	err := s.db.QueryRowContext(ctx, `
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
	err = s.db.QueryRowContext(ctx, `
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

func (s *WriteBaseStore) Abort(ctx context.Context, operationID string) error {
	return s.transitionFromStaged(ctx, operationID, anime.WriteOperationStatusAborted)
}

func (s *WriteBaseStore) ListStaged(ctx context.Context) ([]anime.WriteOperation, error) {
	rows, err := s.db.QueryContext(ctx, writeOperationSelect+`
		WHERE status = ?
		ORDER BY created_at_ms ASC, operation_id ASC
	`, anime.WriteOperationStatusStaged)
	if err != nil {
		return nil, fmt.Errorf("list staged write operations: %w", err)
	}
	defer rows.Close()

	operations := []anime.WriteOperation{}
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

func (s *WriteBaseStore) ListPendingAnimeChanged(ctx context.Context) ([]anime.AnimeChangedOutboxEvent, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT event_id, operation_id, anime_id, payload_json, created_at_ms
		FROM anime_changed_outbox
		WHERE status = 'pending'
		ORDER BY created_at_ms ASC, event_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list pending anime.changed outbox: %w", err)
	}
	defer rows.Close()
	events := []anime.AnimeChangedOutboxEvent{}
	for rows.Next() {
		var event anime.AnimeChangedOutboxEvent
		var payload string
		if err := rows.Scan(&event.EventID, &event.OperationID, &event.AnimeID, &payload, &event.CreatedAtMs); err != nil {
			return nil, fmt.Errorf("scan pending anime.changed outbox: %w", err)
		}
		event.Payload = []byte(payload)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending anime.changed outbox: %w", err)
	}
	return events, nil
}

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

	committedAt := any(committedAtMs)
	if status == anime.WriteOperationStatusSuperseded {
		committedAt = nil
	}
	result, err = tx.ExecContext(ctx, `
		UPDATE anime_write_operations
		SET status = ?, committed_at_ms = ?
		WHERE operation_id = ? AND status = ?
	`, status, committedAt, operation.OperationID, anime.WriteOperationStatusStaged)
	if err != nil {
		return "", fmt.Errorf("finalize write operation %q: %w", operation.OperationID, err)
	}
	rows, err = result.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("read write operation %q finalization result: %w", operation.OperationID, err)
	}
	if rows != 1 {
		return "", fmt.Errorf("finalize write operation %q: %w", operation.OperationID, anime.ErrWriteOperationNotStaged)
	}
	if status == anime.WriteOperationStatusCommitted {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO anime_changed_outbox (
				event_id, operation_id, anime_id, payload_json, status, created_at_ms
			) VALUES (?, ?, ?, ?, 'pending', ?)
		`, operation.OperationID, operation.OperationID, operation.AnimeID, string(operation.DesiredSnapshotJSON), committedAtMs); err != nil {
			return "", fmt.Errorf("insert anime.changed outbox for write operation %q: %w", operation.OperationID, err)
		}
	}
	return status, nil
}

const writeOperationSelect = `
	SELECT operation_id, anime_id, base_modified_at, intended_modified_at,
	       base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
	       status, created_at_ms, committed_at_ms
	FROM anime_write_operations
`

type writeOperationScanner interface {
	Scan(dest ...any) error
}

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

func scanWriteOperation(scanner writeOperationScanner) (anime.WriteOperation, error) {
	var operation anime.WriteOperation
	var baseJSON, desiredJSON, status string
	var committedAt sql.NullInt64
	if err := scanner.Scan(
		&operation.OperationID,
		&operation.AnimeID,
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
