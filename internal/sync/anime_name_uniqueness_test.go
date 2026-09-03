package sync

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

// preChangeAnimeSnapshotsDDL is the table exactly as it shipped before the
// unique anime name index: every current column except name_key.
const preChangeAnimeSnapshotsDDL = `
	CREATE TABLE anime_snapshots (
		anime_id TEXT PRIMARY KEY,
		snapshot_json TEXT NOT NULL,
		snapshot_hash TEXT NOT NULL,
		modified_at INTEGER NOT NULL DEFAULT 0,
		schedule_day_migrated_at INTEGER NOT NULL DEFAULT 0,
		vocabulary_migrated_at INTEGER NOT NULL DEFAULT 0
	)`

// openNameUniquenessDB opens an empty database for one uniqueness case.
func openNameUniquenessDB(t *testing.T) *sql.DB {
	t.Helper()

	path := filepath.ToSlash(filepath.Join(t.TempDir(), "bridge.db"))
	db, err := sql.Open(sqliteDriverName, "file:"+path)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })
	return db
}

// readAllTableColumns lists a table's columns including generated ones, which
// PRAGMA table_info hides and pragma_table_xinfo reports.
func readAllTableColumns(t *testing.T, db *sql.DB, tableName string) []string {
	t.Helper()

	rows, err := db.Query(`SELECT name FROM pragma_table_xinfo(?)`, tableName)
	if err != nil {
		t.Fatalf("pragma_table_xinfo(%s): %v", tableName, err)
	}
	defer closeTestRows(t, rows)

	columns := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan pragma_table_xinfo(%s): %v", tableName, err)
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate pragma_table_xinfo(%s): %v", tableName, err)
	}
	return columns
}

// insertAnimeNamed stores one snapshot carrying the given name.
func insertAnimeNamed(db *sql.DB, animeID, name string) error {
	_, err := db.Exec(
		`INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at)
		 VALUES (?, json_object('id', ?, 'name', ?), 'hash', 1)`,
		animeID, animeID, name)
	return err
}

func TestFreshSchemaRejectsASecondAnimeHoldingTheSameName(t *testing.T) {
	db := openNameUniquenessDB(t)
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	if err := insertAnimeNamed(db, "first", "Comic Girls"); err != nil {
		t.Fatalf("the first anime of a name must be accepted: %v", err)
	}
	if err := insertAnimeNamed(db, "second", "Comic Girls"); err == nil {
		t.Fatal("a second anime holding the same name must be rejected by the database")
	}
}

func TestNameUniquenessIgnoresCaseAndSurroundingSpace(t *testing.T) {
	db := openNameUniquenessDB(t)
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}
	if err := insertAnimeNamed(db, "first", "Tensei Shitara Slime Datta Ken"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := insertAnimeNamed(db, "second", "  tensei shitara slime datta ken  "); err == nil {
		t.Fatal("names differing only by case or padding are the same name")
	}
}

func TestNameUniquenessStillAllowsADistinctName(t *testing.T) {
	db := openNameUniquenessDB(t)
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}
	if err := insertAnimeNamed(db, "series", "Tensei Shitara Slime Datta Ken"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := insertAnimeNamed(db, "ova", "Tensei Shitara Slime Datta Ken OVA"); err != nil {
		t.Fatalf("a different name must still be accepted: %v", err)
	}
}

func TestExistingDatabaseGainsTheNameKeyColumnAndItsIndex(t *testing.T) {
	db := openNameUniquenessDB(t)
	if _, err := db.Exec(preChangeAnimeSnapshotsDDL); err != nil {
		t.Fatalf("seed pre-change table: %v", err)
	}
	if err := insertAnimeNamed(db, "existing", "One Piece"); err != nil {
		t.Fatalf("seed row: %v", err)
	}

	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("migrate an existing database: %v", err)
	}
	if !containsString(readAllTableColumns(t, db, "anime_snapshots"), "name_key") {
		t.Fatal("the migration must add the name_key column to an existing table")
	}
	if err := insertAnimeNamed(db, "duplicate", "One Piece"); err == nil {
		t.Fatal("the migrated database must reject a duplicate name")
	}
}

func TestMigrationNamesTheDuplicatesItCannotIndex(t *testing.T) {
	db := openNameUniquenessDB(t)
	if _, err := db.Exec(preChangeAnimeSnapshotsDDL); err != nil {
		t.Fatalf("seed pre-change table: %v", err)
	}
	for id, name := range map[string]string{
		"a": "Comic Girls", "b": "comic girls", "c": "Sayonara Lara", "d": "Sayonara Lara",
	} {
		if err := insertAnimeNamed(db, id, name); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}

	err := ensureAnimeSnapshotsSchema(db)
	if err == nil {
		t.Fatal("a database holding duplicate names cannot gain the index and must say so")
	}
	message := err.Error()
	for _, want := range []string{"comic girls", "sayonara lara"} {
		if !strings.Contains(message, want) {
			t.Errorf("the failure must name the duplicate %q so it can be fixed, got: %s", want, message)
		}
	}
}

func TestMigrationIsIdempotentOverAnAlreadyMigratedDatabase(t *testing.T) {
	db := openNameUniquenessDB(t)
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("first ensure: %v", err)
	}
	if err := insertAnimeNamed(db, "kept", "One Piece"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("a second ensure over the same database must be a no-op: %v", err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM anime_snapshots`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("re-running the bootstrap must not touch stored rows, got %d", count)
	}
}

func TestNameUniquenessLeavesRecordsWithoutAReadableNameUnconstrained(t *testing.T) {
	db := openNameUniquenessDB(t)
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	// The backup import defaults an absent snapshot_json to the empty string,
	// and a record can legitimately carry JSON without a name.
	for _, record := range []struct{ animeID, snapshot string }{
		{"empty-one", ""},
		{"empty-two", ""},
		{"nameless-one", `{"id":"nameless-one"}`},
		{"nameless-two", `{"id":"nameless-two"}`},
	} {
		_, err := db.Exec(
			`INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at) VALUES (?, ?, 'hash', 1)`,
			record.animeID, record.snapshot)
		if err != nil {
			t.Fatalf("a record with no readable name must still be storable (%s): %v", record.animeID, err)
		}
	}
}
