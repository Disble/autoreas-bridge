package persistence_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/persistence"
)

// insertNoteQ is a write-transaction body that writes one note.
func insertNoteQ(id string) func(persistence.Querier) error {
	return func(q persistence.Querier) error {
		_, err := q.ExecContext(context.Background(), `INSERT INTO notes (id) VALUES (?)`, id)
		return err
	}
}

// writeSucceeds runs a write transaction whose body succeeds.
func writeSucceeds(db *sql.DB) error {
	return persistence.InWriteTx(context.Background(), db, insertNoteQ("a"))
}

// writeFails runs a write transaction whose body writes and then fails.
func writeFails(db *sql.DB) error {
	err := persistence.InWriteTx(context.Background(), db, func(q persistence.Querier) error {
		if err := insertNoteQ("a")(q); err != nil {
			return err
		}
		return errFromFn
	})
	if !errors.Is(err, errFromFn) {
		return errors.New("fn error was not returned unwrapped")
	}
	return nil
}

// writePanics runs a write transaction whose body writes and then panics.
func writePanics(db *sql.DB) (err error) {
	defer func() {
		if recover() == nil {
			err = errors.New("InWriteTx swallowed the panic")
		}
	}()
	return persistence.InWriteTx(context.Background(), db, func(q persistence.Querier) error {
		_ = insertNoteQ("a")(q)
		panic("fn panicked")
	})
}

// writeCancelled runs a write transaction whose caller is cancelled before the commit.
func writeCancelled(db *sql.DB) error {
	ctx, cancel := context.WithCancel(context.Background())
	err := persistence.InWriteTx(ctx, db, func(q persistence.Querier) error {
		_ = insertNoteQ("a")(q)
		cancel()
		return nil
	})
	if err == nil {
		return errors.New("InWriteTx committed after its caller was cancelled")
	}
	return nil
}

// TestInWriteTxCommitsOnlyWhenFnSucceeds pins the commit and the rollback of a
// failing, a panicking and a cancelled body, and that each leaves the single
// connection usable for the next transaction.
func TestInWriteTxCommitsOnlyWhenFnSucceeds(t *testing.T) {
	cases := []struct {
		name  string
		run   func(db *sql.DB) error
		notes int
	}{
		{"success commits", writeSucceeds, 1},
		{"failure rolls back", writeFails, 0},
		{"panic rolls back", writePanics, 0},
		{"cancelled caller rolls back", writeCancelled, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := openNotesDB(t)
			if err := tc.run(db); err != nil {
				t.Fatal(err)
			}
			if err := persistence.InWriteTx(context.Background(), db, insertNoteQ("after")); err != nil {
				t.Fatalf("next write transaction: %v", err)
			}
			if got := noteCount(t, db); got != tc.notes+1 {
				t.Fatalf("notes = %d, want %d", got, tc.notes+1)
			}
		})
	}
}

// TestInWriteTxTakesTheWriteLockWhenItBegins proves the transaction is
// immediate: before its body writes anything, another connection to the same
// file can no longer begin a write.
func TestInWriteTxTakesTheWriteLockWhenItBegins(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notes.db")
	db := openFileDB(t, path)
	if _, err := db.Exec(`CREATE TABLE notes (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatalf("create notes: %v", err)
	}
	other := openFileDB(t, path)

	err := persistence.InWriteTx(context.Background(), db, func(persistence.Querier) error {
		if _, err := other.Exec(`BEGIN IMMEDIATE`); err == nil {
			_, _ = other.Exec(`ROLLBACK`)
			return errors.New("another connection began a write while the write transaction was open")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// TestInWriteTxReportsABeginFailure covers a closed database.
func TestInWriteTxReportsABeginFailure(t *testing.T) {
	db := openNotesDB(t)
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if err := persistence.InWriteTx(context.Background(), db, insertNoteQ("a")); err == nil {
		t.Fatal("InWriteTx began on a closed database")
	}
}

// openFileDB opens a one-connection handle on path that never waits for a lock.
func openFileDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(0)")
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	return db
}
