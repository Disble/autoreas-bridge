package sync

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"autoreas-bridge/internal/download/dbschema"
	"autoreas-bridge/internal/persistence"
)

// newTestBootstrap creates a bootstrap configured for an isolated test directory.
func newTestBootstrap(t *testing.T) SQLiteBootstrap {
	t.Helper()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	return SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}
}

// assertDirectoryExists verifies that path names a directory.
func assertDirectoryExists(t *testing.T, path string) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat directory %q: %v", path, err)
	}
	if !info.IsDir() {
		t.Fatalf("expected %q to be a directory", path)
	}
}

// assertFileExists verifies that path names a regular file.
func assertFileExists(t *testing.T, path string) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat file %q: %v", path, err)
	}
	if info.IsDir() {
		t.Fatalf("expected %q to be a file", path)
	}
}

// queryPragmaString reads a SQLite pragma string for a test assertion.
func queryPragmaString(t *testing.T, db *sql.DB, pragma string) string {
	t.Helper()

	var got string
	if err := db.QueryRow("PRAGMA " + pragma + ";").Scan(&got); err != nil {
		t.Fatalf("query pragma %s: %v", pragma, err)
	}
	return got
}

// queryPragmaInt reads a SQLite pragma integer for a test assertion.
func queryPragmaInt(t *testing.T, db *sql.DB, pragma string) int {
	t.Helper()

	var got int
	if err := db.QueryRow("PRAGMA " + pragma + ";").Scan(&got); err != nil {
		t.Fatalf("query pragma %s: %v", pragma, err)
	}
	return got
}

// tableExists reports whether SQLite contains the named table.
func tableExists(t *testing.T, db *sql.DB, tableName string) bool {
	t.Helper()

	var got string
	err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, tableName).Scan(&got)
	if errors.Is(err, sql.ErrNoRows) {
		return false
	}
	if err != nil {
		t.Fatalf("query sqlite_master for table %q: %v", tableName, err)
	}
	return got == tableName
}

// readTableColumns returns the column names reported for a SQLite table.
func readTableColumns(t *testing.T, db *sql.DB, tableName string) []string {
	t.Helper()

	rows, err := db.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", tableName, err)
	}
	defer closeTestRows(t, rows)

	columns := []string{}
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan pragma table_info(%s): %v", tableName, err)
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate pragma table_info(%s): %v", tableName, err)
	}
	return columns
}

// closeTestDB closes a test database and reports any close error.
func closeTestDB(t *testing.T, db *sql.DB) {
	t.Helper()
	if err := db.Close(); err != nil {
		t.Errorf("close test database: %v", err)
	}
}

// closeTestRows closes test query rows and reports any close error.
func closeTestRows(t *testing.T, rows *sql.Rows) {
	t.Helper()
	if err := rows.Close(); err != nil {
		t.Errorf("close test rows: %v", err)
	}
}

// containsString reports whether target occurs in values.
func containsString(values []string, target string) bool {
	return slices.Contains(values, target)
}

// ensureAnimeSnapshotsSchema is a test-only seam that drives the anime_snapshots descriptor
// through persistence.EnsureTableSchema, preserving the rejection contract exercised by
// TestEnsureAnimeSnapshotsSchemaRejectsUnsupportedSchema.
func ensureAnimeSnapshotsSchema(db *sql.DB) error {
	for _, t := range schemaTables() {
		if t.Name == "anime_snapshots" {
			return persistence.EnsureTableSchema(db, t)
		}
	}
	return fmt.Errorf("anime_snapshots descriptor not found in schemaTables")
}

// ensureDownloadJDConfigSchema is a test-only seam that drives the download_jd_config
// descriptor through persistence.EnsureTableSchema, preserving the idempotency contract
// exercised by TestEnsureDownloadJDConfigSchemaIsIdempotentColumnIntrospection.
func ensureDownloadJDConfigSchema(db *sql.DB) error {
	for _, t := range dbschema.SchemaTables() {
		if t.Name == "download_jd_config" {
			return persistence.EnsureTableSchema(db, t)
		}
	}
	return fmt.Errorf("download_jd_config descriptor not found in download.SchemaTables")
}

// ensureDownloadScheduleConfigSchema is a test-only seam that drives the
// download_schedule_config descriptor through persistence.EnsureTableSchema, preserving
// the idempotency contract exercised by
// TestEnsureDownloadScheduleConfigSchemaIsIdempotentColumnIntrospection.
func ensureDownloadScheduleConfigSchema(db *sql.DB) error {
	for _, t := range dbschema.SchemaTables() {
		if t.Name == "download_schedule_config" {
			return persistence.EnsureTableSchema(db, t)
		}
	}
	return fmt.Errorf("download_schedule_config descriptor not found in download.SchemaTables")
}
