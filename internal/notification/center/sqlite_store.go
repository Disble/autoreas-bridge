package center

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

const (
	defaultRowCap     = 2000
	defaultPruneEvery = 50
)

// Store persists notification-center records and their actions into bridge
// SQLite. Only the write path (InsertRecord) and its in-transaction prune
// step land in this slice; the keyset read model (List, Record) is added in
// sqlite_store_list.go (Slice 2) and the lifecycle statements (MarkRead,
// Archive, Restore, action stamps) in sqlite_store_lifecycle.go (Slices 2/5)
// -- keeping every file under the repo's per-file line budget.
type Store struct {
	db         *sql.DB
	rowCap     int
	pruneEvery int
	successful int
}

// NewStore builds a SQLite-backed notification-center store. A zero-valued
// StoreConfig falls back to defaultRowCap and defaultPruneEvery.
func NewStore(db *sql.DB, config StoreConfig) *Store {
	rowCap := config.RowCap
	if rowCap <= 0 {
		rowCap = defaultRowCap
	}
	pruneEvery := config.PruneEvery
	if pruneEvery <= 0 {
		pruneEvery = defaultPruneEvery
	}
	return &Store{db: db, rowCap: rowCap, pruneEvery: pruneEvery}
}

// nullableString returns nil for an empty string so the column binds as SQL
// NULL rather than an empty string.
func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// marshalRows JSON-encodes a record's detail rows, returning a nil *string so
// the six kinds that carry no detail block bind rows_json as SQL NULL rather
// than an empty-array literal.
func marshalRows(rows []DetailRow) (*string, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	encoded, err := json.Marshal(rows)
	if err != nil {
		return nil, fmt.Errorf("marshal detail rows: %w", err)
	}
	result := string(encoded)
	return &result, nil
}

// InsertRecord persists one record and its actions in a single transaction,
// pruning past the row cap inside that same transaction. It recovers from a
// panic raised by an unusable *sql.DB (e.g. a bare, unopened &sql.DB{}) and
// reports it as a returned error instead, so a Service wrapping a broken
// store degrades to dispatch-only rather than crashing its caller.
func (s *Store) InsertRecord(ctx context.Context, record Record) (id int64, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("notification center: insert record: %v", r)
		}
	}()

	rowsJSON, err := marshalRows(record.Rows)
	if err != nil {
		return 0, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO notification_records (
			created_at_ms, title, body, level, source, correlation_id, rows_json
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`, record.CreatedAtMS, record.Title, record.Body, record.Level, record.Source,
		nullableString(record.CorrelationID), rowsJSON)
	if err != nil {
		return 0, err
	}

	insertedID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	for _, action := range record.Actions {
		argsJSON, marshalErr := json.Marshal(action.Args)
		if marshalErr != nil {
			err = fmt.Errorf("marshal action args: %w", marshalErr)
			return 0, err
		}
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO notification_record_actions (
				id, notification_id, row_ref, ordinal, label, intent, args_json
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`, action.ID, insertedID, nullableString(action.RowRef), action.Ordinal, action.Label, action.Intent, string(argsJSON)); err != nil {
			return 0, err
		}
	}

	if err = s.pruneOldestBeyondRetention(ctx, tx); err != nil {
		return 0, err
	}

	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return insertedID, nil
}

// pruneOldestBeyondRetention deletes the oldest records past the row cap,
// unconditionally on the first successful write of every process and
// thereafter every pruneEvery writes -- mirrors
// internal/observability/eventlog/store.go:50-74's cadence exactly. Deletes
// the doomed records' actions FIRST, because PRAGMA foreign_keys is OFF in
// this database (applyBridgePragmas sets only journal_mode and
// busy_timeout), so ON DELETE CASCADE would not fire.
func (s *Store) pruneOldestBeyondRetention(ctx context.Context, tx *sql.Tx) error {
	s.successful++
	if s.successful > 1 && s.successful%s.pruneEvery != 0 {
		return nil
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM notification_record_actions
		WHERE notification_id IN (
			SELECT id FROM notification_records
			ORDER BY created_at_ms DESC, id DESC
			LIMIT -1 OFFSET ?
		)
	`, s.rowCap); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		DELETE FROM notification_records
		WHERE id IN (
			SELECT id FROM notification_records
			ORDER BY created_at_ms DESC, id DESC
			LIMIT -1 OFFSET ?
		)
	`, s.rowCap)
	return err
}
