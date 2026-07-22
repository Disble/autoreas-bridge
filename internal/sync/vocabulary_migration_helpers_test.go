package sync

import (
	"bytes"
	"database/sql"
	"testing"
)

// openLegacyShapeDB opens a raw SQLite connection using the current
// bootstrap DDL (bypassing OpenBridgeDB, which would immediately run the
// vocabulary migration) so tests can seed pre-cutover Spanish-keyed rows
// before the migration ever sees them.
func openLegacyShapeDB(t *testing.T, dbPath string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy-shape sqlite db: %v", err)
	}
	for _, ddl := range []string{
		animeSnapshotsDDL, changelogDDL, conflictsDDL, animeWriteOperationsDDL, animeChangedOutboxDDL,
	} {
		if _, err := db.Exec(ddl); err != nil {
			closeTestDB(t, db)
			t.Fatalf("create legacy-shape table: %v", err)
		}
	}
	return db
}

// insertLegacyAnimeSnapshotRow seeds one pre-cutover anime_snapshots row.
func insertLegacyAnimeSnapshotRow(t *testing.T, db *sql.DB, animeID, payload, hash string, modifiedAt int64) {
	t.Helper()
	if _, err := db.Exec(
		`INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at) VALUES (?, ?, ?, ?)`,
		animeID, payload, hash, modifiedAt,
	); err != nil {
		t.Fatalf("seed legacy anime_snapshots row: %v", err)
	}
}

// seedLegacyWriteOperation seeds one staged anime_write_operations row with
// Spanish-keyed base/desired snapshots, matching the pre-cutover shape.
func seedLegacyWriteOperation(t *testing.T, db *sql.DB, operationID, animeID string) {
	t.Helper()
	base := `{"_id":"` + animeID + `","nombre":"Base"}`
	desired := `{"_id":"` + animeID + `","nombre":"Desired"}`
	if _, err := db.Exec(`
		INSERT INTO anime_write_operations (
			operation_id, anime_id, base_modified_at, intended_modified_at,
			base_snapshot_json, base_hash, desired_snapshot_json, desired_hash,
			status, created_at_ms
		) VALUES (?, ?, 0, 100, ?, 'stale-base-hash', ?, 'stale-desired-hash', 'staged', 50)
	`, operationID, animeID, base, desired); err != nil {
		t.Fatalf("seed legacy write operation: %v", err)
	}
}

// newSpanishFixtureReader wraps a real Spanish-keyed fixture byte slice as
// an io.Reader for decoding with json.Number precision.
func newSpanishFixtureReader(fixture []byte) *bytes.Reader {
	return bytes.NewReader(fixture)
}
