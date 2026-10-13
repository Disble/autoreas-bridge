// Package sqlitedb opens SQLite databases for tests the way production opens
// the bridge database: one connection (internal/sync/sqlite_bootstrap.go
// sets SetMaxOpenConns(1)). With one connection, a transaction or result set
// left open makes every later query wait forever in the database/sql pool,
// so Open also fails the test when the connection is still in use at its end.
package sqlitedb

import (
	"database/sql"
	"testing"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql for sql.Open below.
	_ "modernc.org/sqlite"
)

// Open returns an in-memory SQLite database limited to one connection, with
// tables ensured through the production schema driver. Its cleanup fails t
// when a connection is still in use (a leaked transaction or unclosed rows),
// then closes the database.
func Open(t testing.TB, tables ...persistence.TableSchema) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory sqlite: %v", err)
	}
	// One connection, as in production; it also keeps ":memory:" one
	// database, since every new connection would open an empty one.
	db.SetMaxOpenConns(1)
	t.Cleanup(func() {
		if inUse := db.Stats().InUse; inUse != 0 {
			t.Errorf("sqlite connection still in use at test end (%d): a transaction or result set was left open", inUse)
		}
		_ = db.Close()
	})
	for _, table := range tables {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
	return db
}
