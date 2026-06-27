package sync

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func newTestBootstrap(t *testing.T) SQLiteBootstrap {
	t.Helper()

	baseDir := filepath.Join(t.TempDir(), "Roaming")
	return SQLiteBootstrap{
		userConfigDir: func() (string, error) {
			return baseDir, nil
		},
	}
}

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

func queryPragmaString(t *testing.T, db *sql.DB, pragma string) string {
	t.Helper()

	var got string
	if err := db.QueryRow("PRAGMA " + pragma + ";").Scan(&got); err != nil {
		t.Fatalf("query pragma %s: %v", pragma, err)
	}
	return got
}

func queryPragmaInt(t *testing.T, db *sql.DB, pragma string) int {
	t.Helper()

	var got int
	if err := db.QueryRow("PRAGMA " + pragma + ";").Scan(&got); err != nil {
		t.Fatalf("query pragma %s: %v", pragma, err)
	}
	return got
}

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

func readTableColumns(t *testing.T, db *sql.DB, tableName string) []string {
	t.Helper()

	rows, err := db.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		t.Fatalf("pragma table_info(%s): %v", tableName, err)
	}
	defer rows.Close()

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

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
