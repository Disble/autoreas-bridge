package sync

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestOpenBridgeDBCreatesAnimeChangedOutboxSchema(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	columns := readTableColumns(t, db, "anime_changed_outbox")
	for _, required := range []string{
		"event_id", "operation_id", "anime_id", "payload_json",
		"status", "created_at_ms", "published_at_ms",
	} {
		if !containsString(columns, required) {
			t.Fatalf("expected anime_changed_outbox column %q, got %#v", required, columns)
		}
	}
}

func TestOpenBridgeDBAddsChangelogSourceEventIDWithoutLosingRows(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy bridge db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE changelog (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			anime_id TEXT NOT NULL,
			change_type TEXT NOT NULL,
			changed_fields_json TEXT NOT NULL,
			snapshot_json TEXT,
			status TEXT NOT NULL,
			changed_at_ms INTEGER NOT NULL
		);
		INSERT INTO changelog (
			anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms
		) VALUES ('anime-1', 'update', '[]', '{}', 'pending', 100);
	`); err != nil {
		legacyDB.Close()
		t.Fatalf("seed current pre-outbox changelog: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy bridge db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("migrate bridge db: %v", err)
	}
	defer db.Close()
	if !containsString(readTableColumns(t, db, "changelog"), "source_event_id") {
		t.Fatal("expected changelog source_event_id migration")
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM changelog WHERE anime_id = 'anime-1'`).Scan(&count); err != nil {
		t.Fatalf("count preserved changelog rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected one preserved changelog row, got %d", count)
	}
}
