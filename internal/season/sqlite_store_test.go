package season

import (
	"database/sql"
	"path/filepath"
	"testing"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"

	"autoreas-bridge/internal/persistence"
)

// openTestSeasonDB opens a temp sqlite DB and applies the season schema directly
// via the schema registry, so the store is tested without depending on the sync
// bootstrap (and without an import cycle).
func openTestSeasonDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	for _, tbl := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, tbl); err != nil {
			t.Fatalf("ensure schema %s: %v", tbl.Name, err)
		}
	}
	return db
}

// openTestSeasonDBAt opens the sqlite file at dbPath and applies the season
// schema, so a test can close one store and open a second over the same file.
func openTestSeasonDBAt(t *testing.T, dbPath string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	for _, tbl := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, tbl); err != nil {
			t.Fatalf("ensure schema %s: %v", tbl.Name, err)
		}
	}
	return db
}

// assertSeasonAnimeMetadataRawNull asserts metadata_json is SQL NULL for one row,
// distinguishing the honest "not recorded" state from an empty string.
func assertSeasonAnimeMetadataRawNull(t *testing.T, db *sql.DB, id string) {
	t.Helper()
	var raw sql.NullString
	if err := db.QueryRow(`SELECT metadata_json FROM season_animes WHERE id = ?`, id).Scan(&raw); err != nil {
		t.Fatalf("select metadata_json: %v", err)
	}
	if raw.Valid {
		t.Fatalf("metadata_json must be SQL NULL, got %q", raw.String)
	}
}

// assertClosureRawNull asserts closure_json is SQL NULL for one seasons row,
// distinguishing the honest "not captured" state from an empty string.
func assertClosureRawNull(t *testing.T, db *sql.DB, id string) {
	t.Helper()
	var raw sql.NullString
	if err := db.QueryRow(`SELECT closure_json FROM seasons WHERE id = ?`, id).Scan(&raw); err != nil {
		t.Fatalf("select closure_json: %v", err)
	}
	if raw.Valid {
		t.Fatalf("closure_json must be SQL NULL, got %q", raw.String)
	}
}
