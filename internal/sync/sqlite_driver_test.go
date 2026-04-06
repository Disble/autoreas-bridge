package sync

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestModerncSQLiteDriverOpensInMemoryDatabase(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Fatalf("ping sqlite database: %v", err)
	}

	if _, err := db.Exec(`CREATE TABLE smoke_test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`); err != nil {
		t.Fatalf("create smoke test table: %v", err)
	}

	if _, err := db.Exec(`INSERT INTO smoke_test(name) VALUES ('autoreas')`); err != nil {
		t.Fatalf("insert smoke test row: %v", err)
	}

	var got string
	if err := db.QueryRow(`SELECT name FROM smoke_test LIMIT 1`).Scan(&got); err != nil {
		t.Fatalf("query smoke test row: %v", err)
	}

	if got != "autoreas" {
		t.Fatalf("expected row value autoreas, got %q", got)
	}
}
