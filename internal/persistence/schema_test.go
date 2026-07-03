package persistence

import (
	"database/sql"
	"fmt"
	"testing"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// TestEnsureTableSchemaCreatesFreshTable verifies that EnsureTableSchema executes CreateDDL
// when the table does not yet exist, and that the table is queryable afterwards.
func TestEnsureTableSchemaCreatesFreshTable(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)
	schema := TableSchema{
		Name: "items",
		CreateDDL: `CREATE TABLE IF NOT EXISTS items (
			id   INTEGER PRIMARY KEY,
			name TEXT NOT NULL
		)`,
	}

	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema on fresh DB: %v", err)
	}

	var name string
	err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='items'`).Scan(&name)
	if err != nil {
		t.Fatalf("query sqlite_master: %v", err)
	}
	if name != "items" {
		t.Fatalf("expected table 'items', got %q", name)
	}
}

// TestEnsureTableSchemaAddsOnlyMissingColumns verifies that only absent ColumnAdds entries
// are applied and already-present columns are not re-altered.
func TestEnsureTableSchemaAddsOnlyMissingColumns(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)

	// Seed: legacy table missing 'score'.
	if _, err := db.Exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}

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
		t.Fatalf("EnsureTableSchema on legacy table: %v", err)
	}

	cols, err := tableColumns(db, "items")
	if err != nil {
		t.Fatalf("read columns after migration: %v", err)
	}
	if !containsColumn(cols, "score") {
		t.Fatalf("expected 'score' column after migration, got %v", cols)
	}
	if !containsColumn(cols, "name") {
		t.Fatalf("expected 'name' column to remain unchanged, got %v", cols)
	}
}

// TestEnsureTableSchemaNoOpWhenCurrent verifies that no schema change is made when the
// table already has every column declared in ColumnAdds.
func TestEnsureTableSchemaNoOpWhenCurrent(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)

	ddl := `CREATE TABLE IF NOT EXISTS items (
		id    INTEGER PRIMARY KEY,
		name  TEXT NOT NULL,
		score INTEGER NOT NULL DEFAULT 0
	)`
	if _, err := db.Exec(ddl); err != nil {
		t.Fatalf("create up-to-date table: %v", err)
	}

	before, err := tableColumns(db, "items")
	if err != nil {
		t.Fatalf("read columns before: %v", err)
	}

	schema := TableSchema{
		Name:      "items",
		CreateDDL: ddl,
		ColumnAdds: []ColumnMigration{
			{Column: "score", AlterDDL: `ALTER TABLE items ADD COLUMN score INTEGER NOT NULL DEFAULT 0`},
		},
	}

	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema (second call, must be no-op): %v", err)
	}

	after, err := tableColumns(db, "items")
	if err != nil {
		t.Fatalf("read columns after: %v", err)
	}
	if len(before) != len(after) {
		t.Fatalf("expected no schema change: before=%v after=%v", before, after)
	}
}

// TestEnsureTableSchemaRunsCustomMigrateForLegacyShape verifies that when a table exists
// and Migrate is non-nil, the hook is called with the live columns and the ColumnAdds path
// is skipped.
func TestEnsureTableSchemaRunsCustomMigrateForLegacyShape(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)

	// Seed: table with legacy 'old_col'.
	if _, err := db.Exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, old_col TEXT)`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}

	var gotCols []string
	schema := TableSchema{
		Name:      "items",
		CreateDDL: `CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, new_col TEXT NOT NULL)`,
		Migrate: func(db *sql.DB, cols []string) error {
			gotCols = cols
			if _, err := db.Exec(`ALTER TABLE items ADD COLUMN new_col TEXT NOT NULL DEFAULT ''`); err != nil {
				return fmt.Errorf("alter table: %w", err)
			}
			return nil
		},
	}

	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema with Migrate hook: %v", err)
	}

	if len(gotCols) == 0 {
		t.Fatal("expected Migrate to be called with live columns")
	}
	foundOldCol := false
	for _, c := range gotCols {
		if c == "old_col" {
			foundOldCol = true
			break
		}
	}
	if !foundOldCol {
		t.Fatalf("expected live cols passed to Migrate to contain 'old_col', got %v", gotCols)
	}

	cols, err := tableColumns(db, "items")
	if err != nil {
		t.Fatalf("read columns after Migrate: %v", err)
	}
	if !containsColumn(cols, "new_col") {
		t.Fatalf("expected 'new_col' after Migrate, got %v", cols)
	}
}

// TestEnsureTableSchemaEnsuresIndexes verifies that Indexes are created on both fresh tables
// and re-runs (idempotent via CREATE INDEX IF NOT EXISTS).
func TestEnsureTableSchemaEnsuresIndexes(t *testing.T) {
	t.Parallel()

	db := openTestDB(t)

	schema := TableSchema{
		Name:      "items",
		CreateDDL: `CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
		Indexes: []string{
			`CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)`,
		},
	}

	// First call: creates table and index.
	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema (first call): %v", err)
	}

	var idxName string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_items_name'`).Scan(&idxName); err != nil {
		t.Fatalf("index not found after first call: %v", err)
	}
	if idxName != "idx_items_name" {
		t.Fatalf("expected index 'idx_items_name', got %q", idxName)
	}

	// Second call: must be idempotent (CREATE INDEX IF NOT EXISTS).
	if err := EnsureTableSchema(db, schema); err != nil {
		t.Fatalf("EnsureTableSchema (second call, must be idempotent): %v", err)
	}
}
