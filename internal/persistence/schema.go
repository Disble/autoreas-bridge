// Package persistence provides the generic data-driven schema-bootstrap driver used by
// all autoreas-bridge bounded contexts. It depends only on [database/sql] and declares no
// domain types, so any context package (sync, download) may import it without cycles.
package persistence

import (
	"database/sql"
	"fmt"
	"slices"
)

// ColumnMigration describes a single additive column migration: the column name to probe
// via PRAGMA table_info and the full ALTER TABLE statement to execute when the column is
// absent from the live table.
type ColumnMigration struct {
	// Column is the column name checked via PRAGMA table_info.
	Column string
	// AlterDDL is the full "ALTER TABLE t ADD COLUMN ..." statement executed when Column
	// is absent.
	AlterDDL string
}

// TableSchema is the declarative descriptor for one bridge database table.
// Pass it to [EnsureTableSchema] to apply exactly the schema delta the live DB needs.
type TableSchema struct {
	// Name is the SQLite table name used for PRAGMA table_info and error messages.
	Name string
	// CreateDDL is the full CREATE TABLE IF NOT EXISTS statement representing the current
	// table shape. Executed only when the table does not exist yet.
	CreateDDL string
	// ColumnAdds lists additive column migrations applied in declaration order when the
	// table already exists and Migrate is nil. Each entry runs only when Column is absent.
	ColumnAdds []ColumnMigration
	// Indexes are CREATE INDEX IF NOT EXISTS statements ensured after the table step,
	// always and unconditionally (the statements are safe to re-run).
	Indexes []string
	// Migrate, when non-nil, fully replaces the ColumnAdds path for an existing table.
	// The driver passes the live column names; the hook handles idiosyncratic migrations
	// (legacy rename+rebuild, shape validation, reject-unsupported). The create-fresh case
	// (empty column list) is always handled by CreateDDL — Migrate is never called for it.
	Migrate func(db *sql.DB, cols []string) error
}

// EnsureTableSchema applies descriptor t to db using introspection-based idempotency:
//   - Table absent → execute CreateDDL (with every current column already present).
//   - Table present, Migrate non-nil → call Migrate with the live column names.
//   - Table present, Migrate nil → apply each ColumnMigration whose Column is absent.
//
// After the table step, every entry in Indexes is executed unconditionally (CREATE INDEX IF
// NOT EXISTS makes them safe to re-run). EnsureTableSchema is safe to call on every
// application start without a persisted schema-version stamp.
func EnsureTableSchema(db *sql.DB, t TableSchema) error {
	cols, err := tableColumns(db, t.Name)
	if err != nil {
		return fmt.Errorf("inspect %s schema: %w", t.Name, err)
	}
	if err := applyTableSchema(db, t, cols); err != nil {
		return err
	}
	return ensureIndexes(db, t)
}

// applyTableSchema applies the table creation or migration step for a schema descriptor.
func applyTableSchema(db *sql.DB, t TableSchema, cols []string) error {
	if len(cols) == 0 {
		_, err := db.Exec(t.CreateDDL)
		return wrapSchemaError("create "+t.Name+" table", err)
	}
	if t.Migrate != nil {
		return wrapSchemaError("migrate "+t.Name, t.Migrate(db, cols))
	}
	return addMissingColumns(db, t, cols)
}

// addMissingColumns applies declared column migrations that are absent from the table.
func addMissingColumns(db *sql.DB, t TableSchema, cols []string) error {
	for _, migration := range t.ColumnAdds {
		if containsColumn(cols, migration.Column) {
			continue
		}
		if _, err := db.Exec(migration.AlterDDL); err != nil {
			return fmt.Errorf("add column %s.%s: %w", t.Name, migration.Column, err)
		}
	}
	return nil
}

// ensureIndexes executes each declared index statement for the table.
func ensureIndexes(db *sql.DB, t TableSchema) error {
	for _, index := range t.Indexes {
		if _, err := db.Exec(index); err != nil {
			return fmt.Errorf("ensure index on %s: %w", t.Name, err)
		}
	}
	return nil
}

// wrapSchemaError adds the schema operation context to a non-nil error.
func wrapSchemaError(operation string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", operation, err)
}

// tableColumns returns the column names of tableName via PRAGMA table_info.
// Returns an empty non-nil slice (without error) when the table does not exist.
func tableColumns(db *sql.DB, tableName string) (columns []string, err error) {
	// NOSONAR go:S2077 -- tableName (every caller passes a TableSchema.Name literal) is a compile-time internal literal,
	// never caller data; SQLite cannot bind an identifier as a parameter.
	rows, err := db.Query(`PRAGMA table_info(` + tableName + `)`) // NOSONAR
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); err == nil && closeErr != nil {
			columns = nil
			err = closeErr
		}
	}()
	columns = []string{}
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var defaultVal sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return nil, err
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

// containsColumn reports whether target appears in columns.
func containsColumn(columns []string, target string) bool {
	return slices.Contains(columns, target)
}
