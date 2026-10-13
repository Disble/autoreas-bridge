package persistence

import (
	"context"
	"database/sql"
	"fmt"
)

// InTx runs fn inside one transaction on db and commits only when fn returns
// nil. The rollback is deferred unconditionally, so a failing or panicking fn
// always releases the connection: the bridge database has one connection,
// and a transaction left open would make every later query wait forever. A
// rollback after a commit returns sql.ErrTxDone, which is ignored. fn's own
// error is returned unwrapped, so callers keep their wrapping and sentinels.
func InTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}
