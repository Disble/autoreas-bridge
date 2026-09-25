package sync

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// retiredDiagnosticsTable is the legacy table this slice removes from the
// lifecycle. The name is spelled out here instead of imported because no
// production code declares the table any more: a copy of the literal is what
// lets this file talk about the installs that still hold it.
const retiredDiagnosticsTable = "device_sync_diagnostics"

// retiredDiagnosticsDDL is the shipped 21-column shape of that table, frozen
// because an existing install still stores its rows under exactly this shape.
// The original declaration's comments are dropped -- the columns are the
// contract this guard preserves, and the guard has to keep compiling after the
// declaration itself is deleted from the package.
const retiredDiagnosticsDDL = `
	CREATE TABLE IF NOT EXISTS device_sync_diagnostics (
		device_id                    TEXT NOT NULL,
		reported_at_ms               INTEGER NOT NULL,
		cycle_id                     TEXT NOT NULL UNIQUE,
		degraded                     TEXT,
		trigger_source               TEXT NOT NULL,
		app_state                    TEXT NOT NULL,
		consecutive_unclosed_cycles  INTEGER NOT NULL,
		pending_ops_count            INTEGER NOT NULL,
		cursor                       INTEGER NOT NULL,
		recent_events_json           TEXT NOT NULL DEFAULT '[]',
		previous_cycle_id            TEXT,
		previous_trigger_source      TEXT,
		previous_outcome             TEXT,
		previous_last_stage          TEXT,
		previous_started_at          INTEGER,
		previous_elapsed_ms          INTEGER,
		previous_error_name          TEXT,
		previous_native_errcode_byte INTEGER,
		previous_error_stage         TEXT,
		previous_error_cause         TEXT,
		previous_error_fingerprint   TEXT
	)`

// retiredDiagnosticsIndexDDLs are the four indexes the shipped declaration
// ensured. They are recreated here so the guard compares an install that looks
// like a real one, and so a future hook that rebuilds the table cannot silently
// drop the index behind a per-device read.
var retiredDiagnosticsIndexDDLs = []string{
	`CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_trigger_source
	    ON device_sync_diagnostics(trigger_source, reported_at_ms DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_previous_outcome
	    ON device_sync_diagnostics(previous_outcome, reported_at_ms DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_previous_error_fingerprint
	    ON device_sync_diagnostics(previous_error_fingerprint)`,
	`CREATE INDEX IF NOT EXISTS idx_device_sync_diagnostics_device_id
	    ON device_sync_diagnostics(device_id, reported_at_ms DESC)`,
}

// retiredDiagnosticsSnapshot is the complete observable state of the retired
// table: its sqlite_master row, its indexes, its column definitions and every
// row with its rowid. Rows alone are not enough. A `Migrate` hook that drops
// and recreates the table with the same rows keeps those bytes and still
// replaced the store, and only the rest of this state notices.
type retiredDiagnosticsSnapshot struct {
	master  string
	indexes string
	columns string
	rows    string
}

// TestBootstrapNeverCreatesTheRetiredDeviceSyncDiagnosticsTable owns the rule
// that the lifecycle creates only the tables the registry still declares. The
// replacement store is asserted alongside the absence of the retired one so
// this test cannot pass by bootstrap doing nothing at all.
func TestBootstrapNeverCreatesTheRetiredDeviceSyncDiagnosticsTable(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	if !tableExists(t, db, "device_telemetry_events") {
		t.Fatal("expected the kind-discriminated store to exist after bootstrap")
	}
	if tableExists(t, db, retiredDiagnosticsTable) {
		t.Fatalf(
			"bootstrap created %s: the table is retired from the registry, and a descriptor for it is the only thing that could carry a Migrate or ColumnAdds hook against such an install",
			retiredDiagnosticsTable)
	}
}

// TestBootstrapLeavesTheRetiredDeviceSyncDiagnosticsTableUntouched owns the
// owner's no-lifecycle-data-migration rule for the installs that already hold
// the table: the lifecycle creates and adds, it never reshapes and never drops.
// Bootstrap runs over a database that already holds real rows and the guard
// compares every observable byte afterwards, which is the only evidence that no
// Migrate or ColumnAdds hook ran against them.
func TestBootstrapLeavesTheRetiredDeviceSyncDiagnosticsTableUntouched(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open a handle for the legacy install: %v", err)
	}
	if err := createRetiredDiagnosticsInstall(legacyDB); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("create the retired device_sync_diagnostics install: %v", err)
	}
	before := snapshotRetiredDiagnostics(t, legacyDB)
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open the bridge db over an install holding retired rows: %v", err)
	}
	defer closeTestDB(t, db)

	assertRetiredDiagnosticsUnchanged(t, before, snapshotRetiredDiagnostics(t, db))
}

// createRetiredDiagnosticsInstall builds the retired table, its indexes, and
// rows that vary in the two nullable shapes a real install carries: an explicit
// NULL degraded, a degraded value, a sparse previous_cycle, and an empty
// string. NULL, empty string and literal text must stay distinguishable after
// bootstrap, which is why the snapshot quotes every value in SQL.
func createRetiredDiagnosticsInstall(db *sql.DB) error {
	if _, err := db.Exec(retiredDiagnosticsDDL); err != nil {
		return fmt.Errorf("create %s: %w", retiredDiagnosticsTable, err)
	}
	for _, indexDDL := range retiredDiagnosticsIndexDDLs {
		if _, err := db.Exec(indexDDL); err != nil {
			return fmt.Errorf("create an index on %s: %w", retiredDiagnosticsTable, err)
		}
	}

	rows := []struct {
		deviceID        string
		reportedAtMS    int64
		cycleID         string
		degraded        any
		previousOutcome any
		previousCycleID any
	}{
		{"device-1", 1000, "cycle-1", nil, nil, nil},
		{"device-1", 2000, "cycle-2", "events", "ok", "cycle-1"},
		{"device-2", 3000, "cycle-3", "", "failed", "cycle-0"},
	}
	for _, row := range rows {
		if _, err := db.Exec(`
			INSERT INTO device_sync_diagnostics (
				device_id, reported_at_ms, cycle_id, degraded, trigger_source, app_state,
				consecutive_unclosed_cycles, pending_ops_count, cursor, recent_events_json,
				previous_cycle_id, previous_trigger_source, previous_outcome,
				previous_error_fingerprint
			) VALUES (?, ?, ?, ?, 'foreground_service', 'background', 1, 0, 7, '[]', ?, 'manual', ?, 'abc12345')`,
			row.deviceID, row.reportedAtMS, row.cycleID, row.degraded,
			row.previousCycleID, row.previousOutcome,
		); err != nil {
			return fmt.Errorf("insert retired row %s: %w", row.cycleID, err)
		}
	}
	return nil
}

// snapshotRetiredDiagnostics reads the retired table's full observable state.
// It fails rather than reporting an empty snapshot when the table is gone: a
// dropped table must be a named failure, never a comparison of zero bytes.
func snapshotRetiredDiagnostics(t *testing.T, db *sql.DB) retiredDiagnosticsSnapshot {
	t.Helper()

	if !tableExists(t, db, retiredDiagnosticsTable) {
		t.Fatalf("%s is absent: the lifecycle dropped a table it no longer owns", retiredDiagnosticsTable)
	}
	return retiredDiagnosticsSnapshot{
		master:  retiredDiagnosticsMasterRow(t, db),
		indexes: retiredDiagnosticsIndexes(t, db),
		columns: retiredDiagnosticsColumns(t, db),
		rows:    retiredDiagnosticsRows(t, db),
	}
}

// assertRetiredDiagnosticsUnchanged reports each part of the snapshot that
// moved, so a failure names what a hook reshaped instead of only reporting that
// the two sides differ. Every comparison is byte equality: an equal-length
// column list with a changed type, or a reordered row, is still a rewrite.
func assertRetiredDiagnosticsUnchanged(t *testing.T, before, after retiredDiagnosticsSnapshot) {
	t.Helper()

	if before.master != after.master {
		t.Errorf("retired table's sqlite_master row changed:\nbefore %s\nafter  %s", before.master, after.master)
	}
	if before.indexes != after.indexes {
		t.Errorf("retired table's indexes changed:\nbefore %s\nafter  %s", before.indexes, after.indexes)
	}
	if before.columns != after.columns {
		t.Errorf("retired table's columns changed:\nbefore %s\nafter  %s", before.columns, after.columns)
	}
	if before.rows != after.rows {
		t.Errorf("retired table's rows changed:\nbefore %s\nafter  %s", before.rows, after.rows)
	}
}

// retiredDiagnosticsMasterRow renders the table's sqlite_master row. The root
// page is part of the identity on purpose: a drop followed by an identical
// recreate keeps the name, the DDL and the rows while replacing the store, and
// the root page is what reveals it.
func retiredDiagnosticsMasterRow(t *testing.T, db *sql.DB) string {
	t.Helper()

	var line string
	err := db.QueryRow(`
		SELECT name || '|' || rootpage || '|' || COALESCE(sql, '')
		FROM sqlite_master WHERE type = 'table' AND name = ?
	`, retiredDiagnosticsTable).Scan(&line)
	if err != nil {
		t.Fatalf("read the sqlite_master row for %s: %v", retiredDiagnosticsTable, err)
	}
	return line
}

// retiredDiagnosticsIndexes renders each index as name|unique|origin, sorted
// because PRAGMA index_list has no ordering contract.
func retiredDiagnosticsIndexes(t *testing.T, db *sql.DB) string {
	t.Helper()

	rows, err := db.Query(`PRAGMA index_list(` + retiredDiagnosticsTable + `)`)
	if err != nil {
		t.Fatalf("pragma index_list(%s): %v", retiredDiagnosticsTable, err)
	}
	defer closeTestRows(t, rows)

	lines := []string{}
	for rows.Next() {
		var sequence, unique, originPartial int
		var name, origin string
		if err := rows.Scan(&sequence, &name, &unique, &origin, &originPartial); err != nil {
			t.Fatalf("scan pragma index_list(%s): %v", retiredDiagnosticsTable, err)
		}
		lines = append(lines, fmt.Sprintf("%s|%d|%s", name, unique, origin))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate pragma index_list(%s): %v", retiredDiagnosticsTable, err)
	}
	slices.Sort(lines)
	return strings.Join(lines, "\n")
}

// retiredDiagnosticsColumns renders every column definition in declaration
// order, including its type, nullability, default and primary-key flag: a hook
// that rebuilds the table with the same names but a different type would
// otherwise slip past a name-only comparison.
func retiredDiagnosticsColumns(t *testing.T, db *sql.DB) string {
	t.Helper()

	rows, err := db.Query(`PRAGMA table_info(` + retiredDiagnosticsTable + `)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", retiredDiagnosticsTable, err)
	}
	defer closeTestRows(t, rows)

	lines := []string{}
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, columnType string
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatalf("scan pragma table_info(%s): %v", retiredDiagnosticsTable, err)
		}
		lines = append(lines, fmt.Sprintf("%d|%s|%s|%d|%v|%d", cid, name, columnType, notNull, defaultValue, primaryKey))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate pragma table_info(%s): %v", retiredDiagnosticsTable, err)
	}
	return strings.Join(lines, "\n")
}

// retiredDiagnosticsRows renders every row, rowid included, as one line of
// SQL-quoted values. quote() is the renderer because it keeps NULL apart from
// the empty string and from a text value that spells "NULL", and because it
// needs no column-by-column scan target per nullable shape.
func retiredDiagnosticsRows(t *testing.T, db *sql.DB) string {
	t.Helper()

	columnNames := readTableColumns(t, db, retiredDiagnosticsTable)
	quoted := make([]string, 0, len(columnNames)+1)
	quoted = append(quoted, `quote(rowid)`)
	for _, column := range columnNames {
		quoted = append(quoted, `quote(`+column+`)`)
	}

	rows, err := db.Query(`SELECT ` + strings.Join(quoted, ` || '|' || `) +
		` FROM ` + retiredDiagnosticsTable + ` ORDER BY rowid`)
	if err != nil {
		t.Fatalf("read %s rows: %v", retiredDiagnosticsTable, err)
	}
	defer closeTestRows(t, rows)

	lines := []string{}
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatalf("scan a %s row: %v", retiredDiagnosticsTable, err)
		}
		lines = append(lines, line)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate %s rows: %v", retiredDiagnosticsTable, err)
	}
	return strings.Join(lines, "\n")
}
