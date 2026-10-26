package persistence

import (
	"context"
	"database/sql"
	"fmt"
)

// Querier runs statements inside an open transaction. *sql.Tx and the
// connection InWriteTx hands to its body both satisfy it, so a helper written
// against it serves either kind of transaction.
type Querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// InWriteTx runs fn inside one write transaction that takes SQLite's write
// lock when it begins (BEGIN IMMEDIATE), so a body that reads before it writes
// never has to upgrade its lock halfway through. database/sql cannot begin an
// immediate transaction on a pool whose data source name does not ask for one,
// so the transaction runs on a dedicated connection. fn must use only the
// Querier it receives: the bridge database has one connection, and any other
// statement would wait for this one to finish. The commit happens only when fn
// returns nil; otherwise, and on a panic, the transaction rolls back before the
// connection returns to the pool. fn's own error is returned unwrapped.
func InWriteTx(ctx context.Context, db *sql.DB, fn func(Querier) error) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire write connection: %w", err)
	}
	defer func() { _ = conn.Close() }()
	if _, err := conn.ExecContext(ctx, `BEGIN IMMEDIATE`); err != nil {
		return fmt.Errorf("begin write transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			// Detached from ctx on purpose: a cancelled caller must still end the
			// transaction, or the shared connection returns to the pool inside it.
			_, _ = conn.ExecContext(context.Background(), `ROLLBACK`) // NOSONAR godre:S8239
		}
	}()

	if err := fn(conn); err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, `COMMIT`); err != nil {
		return fmt.Errorf("commit write transaction: %w", err)
	}
	committed = true
	return nil
}
