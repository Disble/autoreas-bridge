package persistence_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"autoreas-bridge/internal/persistence"
)

// TestInTxRollsBackOnAnErrorOrPanicCommitsOnSuccessAndReportsABeginFailure
// drives one database: a body that fails is rolled back and its error
// returned, a body that panics is rolled back with the panic re-raised and the
// connection released, a succeeding body commits, and a closed database fails
// to begin.
func TestInTxRollsBackOnAnErrorOrPanicCommitsOnSuccessAndReportsABeginFailure(t *testing.T) {
	db := openNotesDB(t)
	ctx := context.Background()

	err := persistence.InTx(ctx, db, func(tx *sql.Tx) error {
		if err := insertNote("a")(tx); err != nil {
			return err
		}
		return errFromFn
	})
	if !errors.Is(err, errFromFn) {
		t.Fatalf("InTx error = %v, want %v", err, errFromFn)
	}
	if got := noteCount(t, db); got != 0 {
		t.Fatalf("notes after a failed body = %d, want 0", got)
	}

	assertInTxRollsBackAPanic(t, db)
	if got := noteCount(t, db); got != 0 {
		t.Fatalf("notes after a panicking body = %d, want 0", got)
	}

	if err := persistence.InTx(ctx, db, insertNote("a")); err != nil {
		t.Fatalf("InTx: %v", err)
	}
	if got := noteCount(t, db); got != 1 {
		t.Fatalf("notes = %d, want 1", got)
	}

	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if err := persistence.InTx(ctx, db, insertNote("b")); err == nil {
		t.Fatal("InTx began on a closed database")
	}
}

// assertInTxRollsBackAPanic runs a body that inserts and then panics, and
// fails when InTx swallows the panic.
func assertInTxRollsBackAPanic(t *testing.T, db *sql.DB) {
	t.Helper()

	defer func() {
		if recover() == nil {
			t.Fatal("InTx swallowed the panic")
		}
	}()
	_ = persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		if err := insertNote("a")(tx); err != nil {
			return err
		}
		panic("fn panicked")
	})
}
