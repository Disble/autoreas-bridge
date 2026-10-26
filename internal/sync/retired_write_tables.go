package sync

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/persistence"
)

// dropRetiredWriteTables removes the two tables of the retired two-phase
// anime write: the staged write operations and the anime.changed outbox that
// referenced them. Every save now runs as one transaction that writes the
// snapshot and its changelog row, so nothing reads or writes either table.
//
// The outbox goes first because it holds the foreign key, and both go in one
// transaction, so a failure leaves both in place. IF EXISTS makes every later
// open, and every fresh database, a no-op. Their indexes go with them.
func dropRetiredWriteTables(db *sql.DB) error {
	return persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		for _, table := range []string{"anime_changed_outbox", "anime_write_operations"} {
			if _, err := tx.Exec(`DROP TABLE IF EXISTS ` + table); err != nil { // NOSONAR go:S2077 -- table is a compile-time literal from the list above.
				return fmt.Errorf("drop retired table %s: %w", table, err)
			}
		}
		return nil
	})
}
