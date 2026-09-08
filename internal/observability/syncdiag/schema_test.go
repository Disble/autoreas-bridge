package syncdiag

import (
	"database/sql"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// openSyncDiagTestDB creates a temporary, schema-less SQLite database. It
// mirrors eventlog's openStoreTestDB but does not apply any schema, since
// this file's own test exercises SchemaTables() applying it.
func openSyncDiagTestDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "syncdiag.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// TestSchemaTablesCreatesTableAndIndexes asserts SchemaTables() returns one
// descriptor for device_sync_diagnostics whose CreateDDL has the full
// 21-column shape and exactly the 4 declared indexes -- no index on
// cycle_id (the inline UNIQUE already serves ON CONFLICT DO NOTHING) and no
// index on degraded.
func TestSchemaTablesCreatesTableAndIndexes(t *testing.T) {
	t.Parallel()

	tables := SchemaTables()
	if len(tables) != 1 {
		t.Fatalf("expected exactly one table schema, got %d", len(tables))
	}
	table := tables[0]
	if table.Name != "device_sync_diagnostics" {
		t.Fatalf("expected table name device_sync_diagnostics, got %q", table.Name)
	}

	db := openSyncDiagTestDB(t)
	if err := persistence.EnsureTableSchema(db, table); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	assertSchemaColumns(t, db)
	assertSchemaIndexes(t, db)
}

// assertSchemaColumns asserts the live table has exactly the 21 columns the
// wire envelope and its previous_cycle nested object require, and none of
// the bare names a misread of the wire shape would produce (outcome,
// error_code, last_stage, error_fingerprint belong only under previous_*).
func assertSchemaColumns(t *testing.T, db *sql.DB) {
	t.Helper()
	cols := tableColumnNames(t, db)
	if len(cols) != 21 {
		t.Fatalf("expected 21 columns, got %d: %v", len(cols), cols)
	}
	want := []string{
		"device_id", "reported_at_ms", "cycle_id", "degraded", "trigger_source",
		"app_state", "consecutive_unclosed_cycles", "pending_ops_count", "cursor",
		"recent_events_json", "previous_cycle_id", "previous_trigger_source",
		"previous_outcome", "previous_last_stage", "previous_started_at",
		"previous_elapsed_ms", "previous_error_name", "previous_native_errcode_byte",
		"previous_error_stage", "previous_error_cause", "previous_error_fingerprint",
	}
	for _, name := range want {
		if !slices.Contains(cols, name) {
			t.Fatalf("expected column %q, got %v", name, cols)
		}
	}
	for _, bad := range []string{"outcome", "error_code", "last_stage", "error_fingerprint"} {
		if slices.Contains(cols, bad) {
			t.Fatalf("unexpected bare column %q present (must be previous_-prefixed)", bad)
		}
	}
}

// assertSchemaIndexes asserts exactly the 4 explicit indexes design.md
// specifies, none of them touching degraded.
func assertSchemaIndexes(t *testing.T, db *sql.DB) {
	t.Helper()
	names := namedIndexes(t, db)
	if len(names) != 4 {
		t.Fatalf("expected exactly 4 explicit indexes, got %d: %v", len(names), names)
	}
	for _, name := range names {
		if strings.Contains(name, "degraded") {
			t.Fatalf("degraded must not be indexed, found index %q", name)
		}
	}

	want := [][]string{
		{"trigger_source", "reported_at_ms"},
		{"previous_outcome", "reported_at_ms"},
		{"previous_error_fingerprint"},
		{"device_id", "reported_at_ms"},
	}
	for _, cols := range want {
		if !anyIndexCoversColumns(t, db, names, cols) {
			t.Fatalf("expected an index covering columns %v among %v", cols, names)
		}
	}
}

// tableColumnNames returns device_sync_diagnostics's column names via
// PRAGMA table_info.
func tableColumnNames(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`PRAGMA table_info(device_sync_diagnostics)`)
	if err != nil {
		t.Fatalf("pragma table_info: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var cols []string
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var defaultVal sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			t.Fatalf("scan table_info row: %v", err)
		}
		cols = append(cols, name)
	}
	return cols
}

// namedIndexes returns the explicitly declared (non-autoindex) index names
// on device_sync_diagnostics. SQLite's implicit index backing the inline
// cycle_id UNIQUE constraint is excluded: it is not one of the 4 CREATE
// INDEX statements under test.
func namedIndexes(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`PRAGMA index_list(device_sync_diagnostics)`)
	if err != nil {
		t.Fatalf("pragma index_list: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var names []string
	for rows.Next() {
		var seq int
		var name, origin string
		var unique, partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			t.Fatalf("scan index_list row: %v", err)
		}
		if strings.HasPrefix(name, "sqlite_autoindex_") {
			continue
		}
		names = append(names, name)
	}
	return names
}

// anyIndexCoversColumns reports whether any named index's leading columns,
// in order, match cols exactly.
func anyIndexCoversColumns(t *testing.T, db *sql.DB, names []string, cols []string) bool {
	t.Helper()
	for _, name := range names {
		if indexColumnsMatch(t, db, name, cols) {
			return true
		}
	}
	return false
}

// indexColumnsMatch reports whether indexName's columns exactly equal want,
// in order.
func indexColumnsMatch(t *testing.T, db *sql.DB, indexName string, want []string) bool {
	t.Helper()
	// NOSONAR go:S2077 -- indexName is sourced only from PRAGMA index_list on this
	// package's own compile-time table name, never external input; SQLite cannot
	// bind an identifier as a parameter.
	rows, err := db.Query(`PRAGMA index_info(` + indexName + `)`) // NOSONAR
	if err != nil {
		t.Fatalf("pragma index_info(%s): %v", indexName, err)
	}
	defer func() { _ = rows.Close() }()
	var got []string
	for rows.Next() {
		var seqno, cid int
		var name string
		if err := rows.Scan(&seqno, &cid, &name); err != nil {
			t.Fatalf("scan index_info row: %v", err)
		}
		got = append(got, name)
	}
	if len(got) != len(want) {
		return false
	}
	for i, name := range want {
		if got[i] != name {
			return false
		}
	}
	return true
}
