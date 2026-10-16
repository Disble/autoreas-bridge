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

// TestOpenBridgeDBAddsDerivedOutboxColumnsWithoutLosingRows upgrades an outbox
// written before the derived columns existed: one predating both, and one that
// already has changed_fields_json, which is the shape every installed database
// had when change_type was introduced. The missing columns are added, the
// pending row survives, and it reads back with no change type -- so the
// changelog recorder keeps recording it as the update it always was.
func TestOpenBridgeDBAddsDerivedOutboxColumnsWithoutLosingRows(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name          string
		derivedColumn string
	}{
		{name: "predates both derived columns", derivedColumn: ""},
		{name: "already has changed fields", derivedColumn: "changed_fields_json TEXT,"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			dbPath := seedPreDerivationOutbox(t, tc.derivedColumn)
			db, err := OpenBridgeDB(dbPath)
			if err != nil {
				t.Fatalf("migrate bridge db: %v", err)
			}
			defer closeTestDB(t, db)
			assertMigratedOutbox(t, db)
		})
	}
}

// seedPreDerivationOutbox writes a bridge database whose outbox predates the
// change_type column, holding one pending row, and returns its path.
// derivedColumn is the optional changed_fields_json definition to include.
func seedPreDerivationOutbox(t *testing.T, derivedColumn string) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy bridge db: %v", err)
	}
	if _, err := legacyDB.Exec(`
		CREATE TABLE anime_changed_outbox (
			event_id TEXT PRIMARY KEY,
			operation_id TEXT NOT NULL UNIQUE,
			anime_id TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			` + derivedColumn + `
			status TEXT NOT NULL CHECK (status IN ('pending', 'published')),
			created_at_ms INTEGER NOT NULL,
			published_at_ms INTEGER
		);
		INSERT INTO anime_changed_outbox (event_id, operation_id, anime_id, payload_json, status, created_at_ms)
		VALUES ('event-legacy', 'operation-legacy', 'anime-legacy', '{"id":"anime-legacy"}', 'pending', 100);
	`); err != nil {
		closeTestDB(t, legacyDB)
		t.Fatalf("seed pre-derivation outbox: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy bridge db: %v", err)
	}
	return dbPath
}

// assertMigratedOutbox checks that both derived columns exist and the legacy
// pending row survived with no change type.
func assertMigratedOutbox(t *testing.T, db *sql.DB) {
	t.Helper()
	columns := readTableColumns(t, db, "anime_changed_outbox")
	for _, required := range []string{"changed_fields_json", "change_type"} {
		if !containsString(columns, required) {
			t.Fatalf("expected migrated outbox column %q, got %#v", required, columns)
		}
	}
	pending, err := NewWriteBaseStore(db).ListPendingAnimeChanged(t.Context())
	if err != nil {
		t.Fatalf("list migrated outbox: %v", err)
	}
	if len(pending) != 1 || pending[0].EventID != "event-legacy" || pending[0].ChangeType != "" {
		t.Fatalf("expected the legacy row with no change type, got %#v", pending)
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
		closeTestDB(t, legacyDB)
		t.Fatalf("seed current pre-outbox changelog: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy bridge db: %v", err)
	}

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("migrate bridge db: %v", err)
	}
	defer closeTestDB(t, db)
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
