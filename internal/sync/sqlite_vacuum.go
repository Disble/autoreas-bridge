package sync

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	// autoVacuumIncremental is the value PRAGMA auto_vacuum reports for INCREMENTAL.
	autoVacuumIncremental = 2
	// incrementalVacuumPages bounds one incremental_vacuum pass: 2,048 pages of 4 KiB
	// return at most 8 MB, short enough that the single bridge connection is held only
	// briefly (docs/observability/budgets.md records the measured timing).
	incrementalVacuumPages = 2048
	// IncrementalVacuumInterval is how often RunIncrementalVacuumLoop returns the pages
	// that store prunes freed since the previous pass.
	IncrementalVacuumInterval = 30 * time.Minute
)

// runFullVacuum rebuilds the whole file. It must run outside any transaction.
func runFullVacuum(db *sql.DB) error {
	if _, err := db.Exec("VACUUM"); err != nil {
		return fmt.Errorf("vacuum: %w", err)
	}
	return nil
}

// ensureIncrementalAutoVacuum switches the bridge file to auto_vacuum INCREMENTAL once.
// PRAGMA auto_vacuum reads the stored mode, not a pending one, so a file already
// incremental (new files get it from applyBridgePragmas) is left alone and the full
// VACUUM runs a single time per install. On failure the file keeps its mode and data.
func ensureIncrementalAutoVacuum(db *sql.DB, fullVacuum func(*sql.DB) error) error {
	if _, err := db.Exec("PRAGMA auto_vacuum = INCREMENTAL"); err != nil {
		return fmt.Errorf("set auto_vacuum INCREMENTAL: %w", err)
	}
	mode, err := readAutoVacuum(db)
	if err != nil {
		return err
	}
	if mode == autoVacuumIncremental {
		return nil
	}
	if err := fullVacuum(db); err != nil {
		return fmt.Errorf("convert to auto_vacuum INCREMENTAL: %w", err)
	}
	// VACUUM in WAL mode writes the rebuilt file through the WAL; truncate it so the
	// conversion does not leave a WAL as large as the database behind.
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return fmt.Errorf("checkpoint after conversion: %w", err)
	}
	return nil
}

// readAutoVacuum returns the stored auto_vacuum mode (0 NONE, 1 FULL, 2 INCREMENTAL).
func readAutoVacuum(db *sql.DB) (int, error) {
	var mode int
	if err := db.QueryRow("PRAGMA auto_vacuum").Scan(&mode); err != nil {
		return 0, fmt.Errorf("read auto_vacuum: %w", err)
	}
	return mode, nil
}

// IncrementalVacuum returns up to incrementalVacuumPages free pages to the disk and
// reports how many it returned. It is a no-op on a file that is not incremental.
func IncrementalVacuum(ctx context.Context, db *sql.DB) (int, error) {
	return incrementalVacuum(ctx, db, incrementalVacuumPages)
}

// incrementalVacuum runs one bounded incremental_vacuum pass of at most pages pages.
func incrementalVacuum(ctx context.Context, db *sql.DB, pages int) (int, error) {
	before, err := readFreelistCount(ctx, db)
	if err != nil {
		return 0, err
	}
	if before == 0 {
		return 0, nil
	}
	if err := stepIncrementalVacuum(ctx, db, pages); err != nil {
		return 0, err
	}
	after, err := readFreelistCount(ctx, db)
	if err != nil {
		return 0, err
	}
	return before - after, nil
}

// stepIncrementalVacuum steps the pragma to completion. SQLite frees one page per
// step, and Exec on this driver stops after the first step, so the statement is run
// as a query and drained: an Exec frees a single page whatever the bound says.
func stepIncrementalVacuum(ctx context.Context, db *sql.DB, pages int) (err error) {
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA incremental_vacuum(%d)", pages))
	if err != nil {
		return fmt.Errorf("incremental_vacuum(%d): %w", pages, err)
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close incremental_vacuum(%d): %w", pages, closeErr)
		}
	}()
	for rows.Next() {
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("incremental_vacuum(%d): %w", pages, err)
	}
	return nil
}

// readFreelistCount returns the number of unused pages in the file.
func readFreelistCount(ctx context.Context, db *sql.DB) (int, error) {
	var count int
	if err := db.QueryRowContext(ctx, "PRAGMA freelist_count").Scan(&count); err != nil {
		return 0, fmt.Errorf("read freelist_count: %w", err)
	}
	return count, nil
}

// RunIncrementalVacuumLoop runs IncrementalVacuum every interval until ctx is done.
// Prunes happen inside the stores' write transactions, so the pass runs on its own
// timer, never on a request path. A failed pass is logged and retried next tick.
func RunIncrementalVacuumLoop(ctx context.Context, db *sql.DB, interval time.Duration, logf func(string, ...any)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := IncrementalVacuum(ctx, db); err != nil && ctx.Err() == nil {
				logf("incremental vacuum: %v", err)
			}
		}
	}
}
