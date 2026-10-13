package sqlitedb_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// recordingTB captures the cleanups and errors Open registers, so a test can
// run them itself and inspect what they report.
type recordingTB struct {
	testing.TB
	cleanups []func()
	errors   []string
}

// Cleanup records fn instead of running it at the end of the real test.
func (r *recordingTB) Cleanup(fn func()) { r.cleanups = append(r.cleanups, fn) }

// Errorf records a reported failure.
func (r *recordingTB) Errorf(format string, args ...any) {
	r.errors = append(r.errors, fmt.Sprintf(format, args...))
}

// runCleanups runs the recorded cleanups last-in first-out, like testing.
func (r *recordingTB) runCleanups() {
	for _, fn := range slices.Backward(r.cleanups) {
		fn()
	}
}

// notesTable is a minimal schema for the helper's tests.
var notesTable = persistence.TableSchema{Name: "notes", CreateDDL: `CREATE TABLE notes (id TEXT PRIMARY KEY)`}

func TestOpenEnsuresTablesOnOneConnection(t *testing.T) {
	db := sqlitedb.Open(t, notesTable)
	if _, err := db.Exec(`INSERT INTO notes (id) VALUES ('a')`); err != nil {
		t.Fatalf("insert into an ensured table: %v", err)
	}
	if got := db.Stats().MaxOpenConnections; got != 1 {
		t.Fatalf("MaxOpenConnections = %d, want 1", got)
	}
}

func TestOpenCleanupPassesAndClosesWhenNothingLeaks(t *testing.T) {
	rec := &recordingTB{TB: t}
	db := sqlitedb.Open(rec, notesTable)
	if _, err := db.Exec(`INSERT INTO notes (id) VALUES ('a')`); err != nil {
		t.Fatalf("insert: %v", err)
	}

	rec.runCleanups()
	if len(rec.errors) != 0 {
		t.Fatalf("cleanup reported %v, want nothing", rec.errors)
	}
	if err := db.Ping(); err == nil {
		t.Fatal("cleanup left the database open")
	}
}

// TestOpenCleanupFailsTheTestWhenAResultSetLeaks leaks rows rather than a
// transaction: both hold the one connection, and opening a transaction by
// hand is reserved to internal/persistence by tools/checkarchitecture.
func TestOpenCleanupFailsTheTestWhenAResultSetLeaks(t *testing.T) {
	rec := &recordingTB{TB: t}
	db := sqlitedb.Open(rec, notesTable)
	if _, err := db.Exec(`INSERT INTO notes (id) VALUES ('a')`); err != nil {
		t.Fatalf("insert: %v", err)
	}
	rows, err := db.Query(`SELECT id FROM notes`)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	t.Cleanup(func() { _ = rows.Close() })

	rec.runCleanups()
	if len(rec.errors) != 1 || !strings.Contains(rec.errors[0], "still in use") {
		t.Fatalf("cleanup reported %v, want one leak error", rec.errors)
	}
}
