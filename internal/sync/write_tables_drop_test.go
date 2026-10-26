package sync

import (
	"database/sql"
	"fmt"
	"maps"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// droppedWriteTables are the tables of the retired two-phase write: the
// staged write operations and the anime.changed outbox that referenced them.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
var droppedWriteTables = []string{"anime_changed_outbox", "anime_write_operations"}

// shippedWriteTablesDDL is the last shape of the two retired tables an
// installed database holds, with their indexes and one row each.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
const shippedWriteTablesDDL = `
	CREATE TABLE IF NOT EXISTS anime_write_operations (
		operation_id TEXT PRIMARY KEY,
		anime_id TEXT NOT NULL,
		batch_id TEXT NOT NULL DEFAULT '',
		batch_order INTEGER NOT NULL DEFAULT 0,
		batch_size INTEGER NOT NULL DEFAULT 1,
		base_modified_at INTEGER NOT NULL,
		intended_modified_at INTEGER NOT NULL,
		base_snapshot_json TEXT NOT NULL,
		base_hash TEXT NOT NULL,
		desired_snapshot_json TEXT NOT NULL,
		desired_hash TEXT NOT NULL,
		status TEXT NOT NULL CHECK (status IN ('staged', 'committed', 'aborted', 'superseded')),
		created_at_ms INTEGER NOT NULL,
		committed_at_ms INTEGER,
		request_id TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_anime_write_operations_anime_token ON anime_write_operations (anime_id, intended_modified_at, status);
	CREATE INDEX IF NOT EXISTS idx_anime_write_operations_recovery ON anime_write_operations (status, created_at_ms, operation_id);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_write_operations_live_reservation ON anime_write_operations (anime_id) WHERE status = 'staged';
	CREATE TABLE IF NOT EXISTS anime_changed_outbox (
		event_id TEXT PRIMARY KEY,
		operation_id TEXT NOT NULL UNIQUE,
		anime_id TEXT NOT NULL,
		payload_json TEXT NOT NULL,
		changed_fields_json TEXT,
		change_type TEXT,
		status TEXT NOT NULL CHECK (status IN ('pending', 'published')),
		created_at_ms INTEGER NOT NULL,
		published_at_ms INTEGER,
		FOREIGN KEY (operation_id) REFERENCES anime_write_operations(operation_id)
	);
	CREATE INDEX IF NOT EXISTS idx_anime_changed_outbox_pending ON anime_changed_outbox (status, created_at_ms, event_id);
	INSERT INTO anime_write_operations (operation_id, anime_id, base_modified_at, intended_modified_at,
		base_snapshot_json, base_hash, desired_snapshot_json, desired_hash, status, created_at_ms, committed_at_ms)
	VALUES ('operation-1', 'anime-1', 100, 200, '{"id":"anime-1"}', 'base', '{"id":"anime-1"}', 'desired', 'committed', 150, 200);
	INSERT INTO anime_changed_outbox (event_id, operation_id, anime_id, payload_json, status, created_at_ms)
	VALUES ('operation-1', 'operation-1', 'anime-1', '{"id":"anime-1"}', 'pending', 200);
`

// TestOpenBridgeDBNeverCreatesTheRetiredWriteTables proves a fresh database
// holds neither retired table nor any of their indexes.
func TestOpenBridgeDBNeverCreatesTheRetiredWriteTables(t *testing.T) {
	t.Parallel()

	assertNoRetiredWriteSchema(t, openTestBridgeDB(t))
}

// TestOpenBridgeDBDropsTheRetiredWriteTablesAndKeepsEveryOtherRow upgrades a
// database that still holds both tables, with rows, next to rows in the
// tables that stay. The first open drops both tables and changes no other
// row; the second open changes nothing at all.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func TestOpenBridgeDBDropsTheRetiredWriteTablesAndKeepsEveryOtherRow(t *testing.T) {
	t.Parallel()

	dbPath := seedRetiredWriteTables(t)
	before := dumpBridgeTables(t, dbPath)
	for _, table := range droppedWriteTables {
		if _, ok := before[table]; !ok {
			t.Fatalf("seed is missing %s", table)
		}
	}

	migrated := reopenBridgeDB(t, dbPath)
	assertNoRetiredWriteSchema(t, migrated)
	closeTestDB(t, migrated)
	after := dumpBridgeTables(t, dbPath)
	for _, table := range droppedWriteTables {
		delete(before, table)
	}
	if !maps.Equal(before, after) {
		t.Fatalf("tables changed by the drop:\nbefore %v\nafter  %v", before, after)
	}

	closeTestDB(t, reopenBridgeDB(t, dbPath))
	if again := dumpBridgeTables(t, dbPath); !maps.Equal(after, again) {
		t.Fatalf("second open changed the database:\nfirst  %v\nsecond %v", after, again)
	}
}

// seedRetiredWriteTables builds a bridge database at its current schema, adds
// the two retired tables with a row each and rows in tables that stay, and
// returns its path.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func seedRetiredWriteTables(t *testing.T) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db := reopenBridgeDB(t, dbPath)
	seedAnimeSnapshot(t, db, "anime-1", `{"id":"anime-1","name":"Kept"}`)
	if _, err := db.Exec(shippedWriteTablesDDL + `
		INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, source_event_id, status, changed_at_ms)
		VALUES ('anime-1', 'update', '["name"]', '{"id":"anime-1","name":"Kept"}', 'event-kept', 'pending', 300);
		INSERT INTO conflicts (conflict_id, anime_id, local_snapshot_json, remote_snapshot_json, detected_at_ms, status)
		VALUES ('conflict-1', 'anime-1', '{"id":"anime-1"}', '{"id":"anime-1"}', 400, 'open');
	`); err != nil {
		closeTestDB(t, db)
		t.Fatalf("seed retired write tables: %v", err)
	}
	closeTestDB(t, db)
	return dbPath
}

// reopenBridgeDB opens the bridge database at dbPath through the production bootstrap.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func reopenBridgeDB(t *testing.T, dbPath string) *sql.DB {
	t.Helper()
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	return db
}

// assertNoRetiredWriteSchema fails when either retired table or one of their
// indexes is present.
func assertNoRetiredWriteSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	var names []string
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE name LIKE '%anime_write_operations%' OR name LIKE '%anime_changed_outbox%'`)
	if err != nil {
		t.Fatalf("query retired schema: %v", err)
	}
	defer closeTestRows(t, rows)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan retired schema: %v", err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate retired schema: %v", err)
	}
	if len(names) != 0 {
		t.Fatalf("expected no retired write schema, got %v", names)
	}
}

// dumpBridgeTables reads every table of the database at dbPath, opened
// directly without the bootstrap, as one sorted text line per row.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func dumpBridgeTables(t *testing.T, dbPath string) map[string]string {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw bridge db: %v", err)
	}
	defer closeTestDB(t, db)
	var tables []string
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		t.Fatalf("list tables: %v", err)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan table name: %v", err)
		}
		tables = append(tables, name)
	}
	closeTestRows(t, rows)
	dump := make(map[string]string, len(tables))
	for _, table := range tables {
		dump[table] = dumpTableRows(t, db, table)
	}
	return dump
}

// dumpTableRows renders every row of table as sorted text lines.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func dumpTableRows(t *testing.T, db *sql.DB, table string) string {
	t.Helper()
	rows, err := db.Query(`SELECT * FROM "` + table + `"`)
	if err != nil {
		t.Fatalf("select %s: %v", table, err)
	}
	defer closeTestRows(t, rows)
	columns, err := rows.Columns()
	if err != nil {
		t.Fatalf("columns of %s: %v", table, err)
	}
	var lines []string
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			t.Fatalf("scan %s: %v", table, err)
		}
		lines = append(lines, fmt.Sprintf("%#v", values))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate %s: %v", table, err)
	}
	slices.Sort(lines)
	return strings.Join(lines, "\n")
}
