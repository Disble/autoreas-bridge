package telemetry

import (
	"database/sql"
	"slices"
	"testing"

	"autoreas-bridge/internal/persistence"
)

// indexEntry is one row of PRAGMA index_list: the index name plus the two
// facts that separate a declared index from a table constraint ("u") and
// from SQLite's own autoindex.
type indexEntry struct {
	name   string
	unique bool
	origin string
}

// TestSchemaTablesDeclaresNoLifecycleMigration asserts the descriptor the
// schema driver consumes declares neither Migrate nor ColumnAdds. That is a
// machine owner for the owner's rule, not a restatement of it: reshaping an
// existing row inside the Bridge lifecycle is forbidden, so the telemetry
// table is create-only and must carry no hook able to do it. It also pins
// the columns and indexes, so a speculative index cannot ride along.
func TestSchemaTablesDeclaresNoLifecycleMigration(t *testing.T) {
	t.Parallel()

	tables := SchemaTables()
	if len(tables) != 1 {
		t.Fatalf("expected exactly one table schema, got %d", len(tables))
	}
	table := tables[0]
	if table.Name != "device_telemetry_events" {
		t.Fatalf("expected table name device_telemetry_events, got %q", table.Name)
	}
	if table.Migrate != nil {
		t.Fatal("expected a nil Migrate hook: the telemetry table is create-only and must never reshape existing rows")
	}
	if len(table.ColumnAdds) != 0 {
		t.Fatalf("expected no ColumnAdds on a create-only table, got %d", len(table.ColumnAdds))
	}

	db := openTelemetryTestDB(t)
	if err := persistence.EnsureTableSchema(db, table); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}
	assertTelemetryColumns(t, db)
	assertTelemetryIndexes(t, db)
}

// assertTelemetryColumns asserts the live table has exactly the envelope
// columns the store binds: one kind, one idempotency key and the shared
// envelope, with no column a single kind owns.
func assertTelemetryColumns(t *testing.T, db *sql.DB) {
	t.Helper()

	want := []string{"device_id", "reported_at_ms", "kind", "event_id", "observed_at_ms", "degraded", "payload_json"}
	if got := columnNames(t, db); !slices.Equal(got, want) {
		t.Fatalf("expected columns %v, got %v", want, got)
	}
}

// assertTelemetryIndexes asserts the table carries only the two declared
// indexes a query uses -- per-kind recency (which also serves the prune) and
// the per-device read -- plus the (kind, event_id) uniqueness constraint
// that scopes identity per kind. Both retired syncdiag indexes are absent by
// construction: their columns do not exist on this table.
func assertTelemetryIndexes(t *testing.T, db *sql.DB) {
	t.Helper()

	entries := listIndexes(t, db)
	declared := declaredIndexNames(entries)
	if len(declared) != 2 {
		t.Fatalf("expected exactly 2 declared indexes, got %d: %v", len(declared), declared)
	}
	for _, columns := range [][]string{{"kind", "reported_at_ms"}, {"device_id", "reported_at_ms"}} {
		if !coversColumns(t, db, entries, columns, false) {
			t.Fatalf("expected a declared index on %v, got %v", columns, declared)
		}
	}
	if !coversColumns(t, db, entries, []string{"kind", "event_id"}, true) {
		t.Fatal("expected a UNIQUE (kind, event_id) constraint so one kind's keys cannot collide with another kind's")
	}
}

// columnNames returns device_telemetry_events's column names via PRAGMA
// table_info, in declaration order.
func columnNames(t *testing.T, db *sql.DB) []string {
	t.Helper()

	rows, err := db.Query(`PRAGMA table_info(device_telemetry_events)`)
	if err != nil {
		t.Fatalf("pragma table_info: %v", err)
	}
	defer func() { _ = rows.Close() }()

	var cols []string
	for rows.Next() {
		var cid, notNull, pk int
		var name, colType string
		var defaultVal sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			t.Fatalf("scan table_info row: %v", err)
		}
		cols = append(cols, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table_info: %v", err)
	}
	return cols
}

// listIndexes returns every index PRAGMA index_list reports for
// device_telemetry_events, autoindexes included: the uniqueness constraint
// this table declares is backed by one.
func listIndexes(t *testing.T, db *sql.DB) []indexEntry {
	t.Helper()

	rows, err := db.Query(`PRAGMA index_list(device_telemetry_events)`)
	if err != nil {
		t.Fatalf("pragma index_list: %v", err)
	}
	defer func() { _ = rows.Close() }()

	var entries []indexEntry
	for rows.Next() {
		var seq, unique, partial int
		var entry indexEntry
		if err := rows.Scan(&seq, &entry.name, &unique, &entry.origin, &partial); err != nil {
			t.Fatalf("scan index_list row: %v", err)
		}
		entry.unique = unique == 1
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate index_list: %v", err)
	}
	return entries
}

// declaredIndexNames returns the names of indexes created by an explicit
// CREATE INDEX statement, excluding the autoindex backing a UNIQUE table
// constraint. Fewer than two means a declared index is missing.
func declaredIndexNames(entries []indexEntry) []string {
	names := []string{}
	for _, entry := range entries {
		if entry.origin == "c" {
			names = append(names, entry.name)
		}
	}
	return names
}

// indexColumns returns one index's columns in order via PRAGMA index_info.
func indexColumns(t *testing.T, db *sql.DB, indexName string) []string {
	t.Helper()

	// NOSONAR go:S2077 -- indexName comes only from PRAGMA index_list on this
	// package's own compile-time table name, never external input; SQLite
	// cannot bind an identifier as a parameter.
	rows, err := db.Query(`PRAGMA index_info(` + indexName + `)`) // NOSONAR
	if err != nil {
		t.Fatalf("pragma index_info(%s): %v", indexName, err)
	}
	defer func() { _ = rows.Close() }()

	var cols []string
	for rows.Next() {
		var seqno, cid int
		var name string
		if err := rows.Scan(&seqno, &cid, &name); err != nil {
			t.Fatalf("scan index_info row: %v", err)
		}
		cols = append(cols, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate index_info(%s): %v", indexName, err)
	}
	return cols
}

// coversColumns reports whether any listed index matches the wanted
// columns, in order, and the wanted uniqueness.
func coversColumns(t *testing.T, db *sql.DB, entries []indexEntry, columns []string, unique bool) bool {
	t.Helper()

	for _, entry := range entries {
		if entry.unique == unique && slices.Equal(indexColumns(t, db, entry.name), columns) {
			return true
		}
	}
	return false
}
