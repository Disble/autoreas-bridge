package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// seedDB creates a WAL database at path holding rows in table t.
func seedDB(t *testing.T, path string, rows ...string) {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer func() { _ = db.Close() }()
	for _, stmt := range []string{"PRAGMA journal_mode=WAL", "CREATE TABLE IF NOT EXISTS t (v TEXT)"} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	for _, row := range rows {
		if _, err := db.Exec("INSERT INTO t (v) VALUES (?)", row); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
}

// readRows returns every value of table t in the database at path.
func readRows(t *testing.T, path string) []string {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer func() { _ = db.Close() }()
	rows, err := db.Query("SELECT v FROM t ORDER BY rowid")
	if err != nil {
		t.Fatalf("query %s: %v", path, err)
	}
	defer func() { _ = rows.Close() }()
	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			t.Fatalf("scan: %v", err)
		}
		out = append(out, v)
	}
	return out
}

func TestCopyDatabaseReplacesTheCopyAndLeavesTheSourceUntouched(t *testing.T) {
	t.Parallel()

	src := filepath.Join(t.TempDir(), "live", "bridge.db")
	if err := os.MkdirAll(filepath.Dir(src), 0o755); err != nil {
		t.Fatal(err)
	}
	seedDB(t, src, "live-1", "live-2")
	dstDir := filepath.Join(t.TempDir(), "dev-data")
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		t.Fatal(err)
	}
	seedDB(t, filepath.Join(dstDir, "bridge.db"), "stale")

	got, err := copyDatabase(src, dstDir)
	if err != nil {
		t.Fatalf("copyDatabase: %v", err)
	}

	if want := filepath.Join(dstDir, "bridge.db"); got != want {
		t.Fatalf("copy path = %q, want %q", got, want)
	}
	if rows := readRows(t, got); strings.Join(rows, ",") != "live-1,live-2" {
		t.Fatalf("copy rows = %v, want the live rows only", rows)
	}
	if rows := readRows(t, src); strings.Join(rows, ",") != "live-1,live-2" {
		t.Fatalf("source rows = %v, want them unchanged", rows)
	}
	for _, sidecar := range []string{"bridge.db-wal", "bridge.db-shm"} {
		if _, err := os.Stat(filepath.Join(dstDir, sidecar)); err == nil {
			t.Fatalf("stale %s left next to the fresh copy", sidecar)
		}
	}
}

func TestCopyDatabaseRefusesUnsafeTargets(t *testing.T) {
	t.Parallel()

	liveDir := filepath.Join(t.TempDir(), "live")
	if err := os.MkdirAll(liveDir, 0o755); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(liveDir, "bridge.db")
	seedDB(t, src, "live")

	cases := []struct {
		name, dstDir, wantErr string
	}{
		{"the live directory", liveDir, "live"},
		{"the live directory in another case", strings.ToUpper(liveDir), "live"},
		{"a relative directory", "dev-data", "absolute"},
		{"no directory", "", "-to"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if _, err := copyDatabase(src, tc.dstDir); err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected an error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
	if rows := readRows(t, src); strings.Join(rows, ",") != "live" {
		t.Fatalf("source rows = %v after refused copies, want them unchanged", rows)
	}
}
