package persistence_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// errFromFn is the failure the transaction body returns on purpose.
var errFromFn = errors.New("fn failed")

// openNotesDB opens a production-shaped database with one notes table.
func openNotesDB(t *testing.T) *sql.DB {
	t.Helper()
	db := sqlitedb.Open(t, persistence.TableSchema{
		Name:      "notes",
		CreateDDL: `CREATE TABLE notes (id TEXT PRIMARY KEY)`,
	})
	return db
}

// insertNote is a transaction body that writes one note.
func insertNote(id string) func(*sql.Tx) error {
	return func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO notes (id) VALUES (?)`, id)
		return err
	}
}

// noteCount counts notes with a deadline, so a connection left inside a
// transaction fails the test quickly instead of hanging the pool.
func noteCount(t *testing.T, db *sql.DB) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notes`).Scan(&n); err != nil {
		t.Fatalf("count notes: %v", err)
	}
	return n
}

func TestInTxCommitsWhenFnSucceeds(t *testing.T) {
	db := openNotesDB(t)
	if err := persistence.InTx(context.Background(), db, insertNote("a")); err != nil {
		t.Fatalf("InTx: %v", err)
	}
	if got := noteCount(t, db); got != 1 {
		t.Fatalf("notes = %d, want 1", got)
	}
}

func TestInTxRollsBackAndReturnsFnError(t *testing.T) {
	db := openNotesDB(t)
	err := persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		if err := insertNote("a")(tx); err != nil {
			return err
		}
		return errFromFn
	})
	if !errors.Is(err, errFromFn) {
		t.Fatalf("InTx error = %v, want %v", err, errFromFn)
	}
	if got := noteCount(t, db); got != 0 {
		t.Fatalf("notes = %d, want 0", got)
	}
}

func TestInTxRollsBackAndReleasesTheConnectionOnPanic(t *testing.T) {
	db := openNotesDB(t)
	func() {
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
	}()
	if got := noteCount(t, db); got != 0 {
		t.Fatalf("notes = %d, want 0", got)
	}
}

// TestInTxSurfacesACommitFailure uses a deferred foreign key, which SQLite
// checks only at COMMIT, so the body succeeds and the commit fails. The next
// transaction must still run on the single connection.
func TestInTxSurfacesACommitFailure(t *testing.T) {
	db := openNotesDB(t)
	for _, statement := range []string{
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE parents (id TEXT PRIMARY KEY)`,
		`CREATE TABLE children (parent_id TEXT REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("prepare %q: %v", statement, err)
		}
	}

	err := persistence.InTx(context.Background(), db, func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO children (parent_id) VALUES ('missing')`)
		return err
	})
	if err == nil {
		t.Fatal("InTx hid a failed commit")
	}
	if err := persistence.InTx(context.Background(), db, insertNote("after")); err != nil {
		t.Fatalf("InTx after a failed commit: %v", err)
	}
	if got := noteCount(t, db); got != 1 {
		t.Fatalf("notes = %d, want 1", got)
	}
}

func TestInTxReportsABeginFailure(t *testing.T) {
	db := openNotesDB(t)
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if err := persistence.InTx(context.Background(), db, insertNote("a")); err == nil {
		t.Fatal("InTx began on a closed database")
	}
}
