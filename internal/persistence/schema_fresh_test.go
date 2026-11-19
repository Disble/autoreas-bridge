package persistence

import "testing"

// TestEnsureTableSchemaCreatesAFreshTableThenLeavesItUnchanged verifies that
// EnsureTableSchema executes CreateDDL when the table does not yet exist, that
// the table is queryable afterwards, and that a second call over the table that
// already has every ColumnAdds column changes nothing.
func TestEnsureTableSchemaCreatesAFreshTableThenLeavesItUnchanged(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	schema := TableSchema{
		Name: "items",
		CreateDDL: `CREATE TABLE IF NOT EXISTS items (
			id    INTEGER PRIMARY KEY,
			name  TEXT NOT NULL,
			score INTEGER NOT NULL DEFAULT 0
		)`,
		ColumnAdds: []ColumnMigration{
			{Column: "score", AlterDDL: `ALTER TABLE items ADD COLUMN score INTEGER NOT NULL DEFAULT 0`},
		},
	}

	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema on fresh DB: %v", err)
	}
	var name string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='items'`).Scan(&name); err != nil {
		t.Fatalf("query sqlite_master: %v", err)
	}
	if name != "items" {
		t.Fatalf("expected table 'items', got %q", name)
	}

	before, err := tableColumns(db, "items")
	if err != nil {
		t.Fatalf("read columns before: %v", err)
	}
	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema (second call, must be no-op): %v", err)
	}
	after, err := tableColumns(db, "items")
	if err != nil {
		t.Fatalf("read columns after: %v", err)
	}
	if len(before) != len(after) || len(after) != 3 {
		t.Fatalf("expected no schema change: before=%v after=%v", before, after)
	}
}
