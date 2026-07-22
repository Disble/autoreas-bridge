package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
)

// TestVocabularyMigrationFreshDatabaseSetsMarkerWithoutRewrite proves scenario
// "Fresh install has no legacy rows to migrate": a brand-new bootstrap sets
// the marker and performs zero rewrite work.
func TestVocabularyMigrationFreshDatabaseSetsMarkerWithoutRewrite(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)

	migrated, err := vocabularyMigrationDone(db)
	if err != nil {
		t.Fatalf("check vocabulary migration marker: %v", err)
	}
	if !migrated {
		t.Fatal("expected vocabulary migration marker to be set after fresh bootstrap")
	}
}

// TestVocabularyMigrationRewritesAnimeSnapshotsRows proves scenario "Existing
// anime_snapshots rows are rewritten to English keys": values survive, and
// snapshot_hash is recomputed from the rewritten bytes.
func TestVocabularyMigrationRewritesAnimeSnapshotsRows(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	const spanishPayload = `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":1,"fechaEstreno":{"$$date":900000000000}}`
	insertLegacyAnimeSnapshotRow(t, legacyDB, "anime-1", spanishPayload, "stale-hash", 500)
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("bootstrap bridge db with vocabulary migration: %v", err)
	}
	defer closeTestDB(t, db)

	var snapshotJSON, snapshotHash string
	var modifiedAt int64
	if err := db.QueryRow(`SELECT snapshot_json, snapshot_hash, modified_at FROM anime_snapshots WHERE anime_id = ?`, "anime-1").
		Scan(&snapshotJSON, &snapshotHash, &modifiedAt); err != nil {
		t.Fatalf("read migrated anime_snapshots row: %v", err)
	}

	var fields map[string]any
	if err := json.Unmarshal([]byte(snapshotJSON), &fields); err != nil {
		t.Fatalf("unmarshal migrated snapshot: %v", err)
	}
	if fields["id"] != "anime-1" || fields["name"] != "One Piece" || fields["episodesWatched"] != float64(664) || fields["status"] != float64(1) || fields["premieredAt"] != float64(900000000000) {
		t.Fatalf("expected English-keyed values preserved, got %#v", fields)
	}
	if _, ok := fields["_id"]; ok {
		t.Fatalf("expected Spanish _id key to be gone, got %#v", fields)
	}
	wantHash := anime.HashSnapshot([]byte(snapshotJSON))
	if snapshotHash != wantHash {
		t.Fatalf("snapshot_hash = %q, want recomputed hash %q", snapshotHash, wantHash)
	}
	if snapshotHash == "stale-hash" {
		t.Fatal("expected snapshot_hash to be recomputed, not left at the pre-migration placeholder")
	}
	if modifiedAt != 500 {
		t.Fatalf("modified_at = %d, want untouched 500", modifiedAt)
	}
}

// TestVocabularyMigrationRewritesNonNullChangelogRowsOnly proves scenario
// "Existing non-null changelog.snapshot_json rows are rewritten": null rows
// are left untouched.
func TestVocabularyMigrationRewritesNonNullChangelogRowsOnly(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	if _, err := legacyDB.Exec(`
		INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES (?, 'update', '[]', ?, 'pending', 100)
	`, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":1}`); err != nil {
		t.Fatalf("seed non-null changelog row: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES (?, 'delete', '[]', NULL, 'pending', 200)
	`, "anime-2"); err != nil {
		t.Fatalf("seed null changelog row: %v", err)
	}
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, db)

	var nonNull sql.NullString
	if err := db.QueryRow(`SELECT snapshot_json FROM changelog WHERE anime_id = ?`, "anime-1").Scan(&nonNull); err != nil {
		t.Fatalf("read non-null changelog row: %v", err)
	}
	if !nonNull.Valid {
		t.Fatal("expected non-null changelog row to remain non-null")
	}
	var fields map[string]any
	if err := json.Unmarshal([]byte(nonNull.String), &fields); err != nil {
		t.Fatalf("unmarshal migrated changelog snapshot: %v", err)
	}
	if fields["id"] != "anime-1" || fields["name"] != "One Piece" {
		t.Fatalf("expected changelog row migrated to English keys, got %#v", fields)
	}

	var stillNull sql.NullString
	if err := db.QueryRow(`SELECT snapshot_json FROM changelog WHERE anime_id = ?`, "anime-2").Scan(&stillNull); err != nil {
		t.Fatalf("read null changelog row: %v", err)
	}
	if stillNull.Valid {
		t.Fatalf("expected null changelog row to remain untouched, got %q", stillNull.String)
	}
}

// TestVocabularyMigrationRewritesConflictRows proves scenario "Conflict
// snapshots are rewritten for verbatim serving".
func TestVocabularyMigrationRewritesConflictRows(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	if _, err := legacyDB.Exec(`
		INSERT INTO conflicts (conflict_id, anime_id, local_snapshot_json, remote_snapshot_json, detected_at_ms, status)
		VALUES ('conflict-1', 'anime-1', ?, ?, 100, 'pending')
	`, `{"_id":"anime-1","nombre":"Local"}`, `{"_id":"anime-1","nombre":"Remote"}`); err != nil {
		t.Fatalf("seed conflict row: %v", err)
	}
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, db)

	var local, remote string
	if err := db.QueryRow(`SELECT local_snapshot_json, remote_snapshot_json FROM conflicts WHERE conflict_id = ?`, "conflict-1").
		Scan(&local, &remote); err != nil {
		t.Fatalf("read migrated conflict row: %v", err)
	}
	var localFields, remoteFields map[string]any
	if err := json.Unmarshal([]byte(local), &localFields); err != nil {
		t.Fatalf("unmarshal migrated local snapshot: %v", err)
	}
	if err := json.Unmarshal([]byte(remote), &remoteFields); err != nil {
		t.Fatalf("unmarshal migrated remote snapshot: %v", err)
	}
	if localFields["name"] != "Local" || remoteFields["name"] != "Remote" {
		t.Fatalf("expected both conflict snapshots migrated to English keys, got local=%#v remote=%#v", localFields, remoteFields)
	}
}

// TestVocabularyMigrationRewritesPendingOutboxRows proves scenario "Pending
// outbox payloads are rewritten before publish".
func TestVocabularyMigrationRewritesPendingOutboxRows(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	seedLegacyWriteOperation(t, legacyDB, "operation-1", "anime-1")
	if _, err := legacyDB.Exec(`
		INSERT INTO anime_changed_outbox (event_id, operation_id, anime_id, payload_json, status, created_at_ms)
		VALUES ('event-1', 'operation-1', 'anime-1', ?, 'pending', 100)
	`, `{"_id":"anime-1","nombre":"Pending Payload"}`); err != nil {
		t.Fatalf("seed pending outbox row: %v", err)
	}
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, db)

	var payload string
	if err := db.QueryRow(`SELECT payload_json FROM anime_changed_outbox WHERE event_id = ?`, "event-1").Scan(&payload); err != nil {
		t.Fatalf("read migrated outbox row: %v", err)
	}
	var fields map[string]any
	if err := json.Unmarshal([]byte(payload), &fields); err != nil {
		t.Fatalf("unmarshal migrated outbox payload: %v", err)
	}
	if fields["name"] != "Pending Payload" {
		t.Fatalf("expected outbox payload migrated to English keys, got %#v", fields)
	}
}

// TestVocabularyMigrationRewritesStagedWriteOperationBeforeRecoveryFinalizes
// proves scenario "Staged write-operation snapshots are rewritten before
// recovery finalizes them": Recover copies the already-English desired
// snapshot into anime_snapshots and the outbox, so no Spanish content reaches
// either after cutover.
func TestVocabularyMigrationRewritesStagedWriteOperationBeforeRecoveryFinalizes(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	seedLegacyWriteOperation(t, legacyDB, "operation-1", "anime-1")
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("bootstrap bridge db: %v", err)
	}
	defer closeTestDB(t, db)

	var baseSnapshotJSON, desiredSnapshotJSON, baseHash, desiredHash string
	if err := db.QueryRow(`SELECT base_snapshot_json, desired_snapshot_json, base_hash, desired_hash FROM anime_write_operations WHERE operation_id = ?`, "operation-1").
		Scan(&baseSnapshotJSON, &desiredSnapshotJSON, &baseHash, &desiredHash); err != nil {
		t.Fatalf("read migrated write operation: %v", err)
	}
	var desiredFields map[string]any
	if err := json.Unmarshal([]byte(desiredSnapshotJSON), &desiredFields); err != nil {
		t.Fatalf("unmarshal migrated desired snapshot: %v", err)
	}
	if desiredFields["name"] != "Desired" {
		t.Fatalf("expected staged desired snapshot migrated to English keys, got %#v", desiredFields)
	}
	if baseHash == "stale-base-hash" || desiredHash == "stale-desired-hash" {
		t.Fatal("expected base_hash/desired_hash to be recomputed, not left at pre-migration placeholders")
	}
	wantDesiredHash := anime.HashSnapshot([]byte(desiredSnapshotJSON))
	if desiredHash != wantDesiredHash {
		t.Fatalf("desired_hash = %q, want recomputed %q", desiredHash, wantDesiredHash)
	}

	store := NewWriteBaseStore(db)
	action, err := store.Recover(context.Background(), "operation-1", desiredHash, 999)
	if err != nil {
		t.Fatalf("recover staged write operation: %v", err)
	}
	if action != anime.WriteRecoveryActionFinalized {
		t.Fatalf("expected recovery to finalize the staged operation, got %v", action)
	}

	var finalSnapshotJSON string
	if err := db.QueryRow(`SELECT snapshot_json FROM anime_snapshots WHERE anime_id = ?`, "anime-1").Scan(&finalSnapshotJSON); err != nil {
		t.Fatalf("read finalized anime_snapshots row: %v", err)
	}
	var finalFields map[string]any
	if err := json.Unmarshal([]byte(finalSnapshotJSON), &finalFields); err != nil {
		t.Fatalf("unmarshal finalized snapshot: %v", err)
	}
	if finalFields["name"] != "Desired" {
		t.Fatalf("expected finalize to copy the already-English desired snapshot, got %#v", finalFields)
	}
	if _, ok := finalFields["nombre"]; ok {
		t.Fatal("expected no Spanish key to reach anime_snapshots via finalize")
	}
}

// TestVocabularyMigrationIsIdempotent proves scenario "Re-running the
// migration is a no-op": a second bootstrap of the same file detects the
// marker and performs no further rewrite.
func TestVocabularyMigrationIsIdempotent(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	insertLegacyAnimeSnapshotRow(t, legacyDB, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":1}`, "stale-hash", 500)
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("first bootstrap: %v", err)
	}
	var firstJSON, firstHash string
	if err := db.QueryRow(`SELECT snapshot_json, snapshot_hash FROM anime_snapshots WHERE anime_id = ?`, "anime-1").Scan(&firstJSON, &firstHash); err != nil {
		t.Fatalf("read row after first bootstrap: %v", err)
	}
	closeTestDB(t, db)

	restarted, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("second bootstrap: %v", err)
	}
	defer closeTestDB(t, restarted)
	var secondJSON, secondHash string
	if err := restarted.QueryRow(`SELECT snapshot_json, snapshot_hash FROM anime_snapshots WHERE anime_id = ?`, "anime-1").Scan(&secondJSON, &secondHash); err != nil {
		t.Fatalf("read row after second bootstrap: %v", err)
	}
	if firstJSON != secondJSON || firstHash != secondHash {
		t.Fatalf("expected idempotent re-run to leave row unchanged: first=(%q,%q) second=(%q,%q)", firstJSON, firstHash, secondJSON, secondHash)
	}
}

// TestVocabularyMigrationRollsBackEntirelyOnFailure proves scenario "All 5
// columns are rewritten in one transaction": an unparseable row in one table
// must roll back every table's rewrite, leaving the database exactly as it
// was before the migration attempt.
func TestVocabularyMigrationRollsBackEntirelyOnFailure(t *testing.T) {
	t.Parallel()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	insertLegacyAnimeSnapshotRow(t, legacyDB, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":1}`, "stale-hash", 500)
	// Malformed JSON in a second, unrelated table forces migrateVocabularyJSON
	// to fail after the first table's rewrite already ran in-transaction.
	if _, err := legacyDB.Exec(`
		INSERT INTO conflicts (conflict_id, anime_id, local_snapshot_json, remote_snapshot_json, detected_at_ms, status)
		VALUES ('conflict-1', 'anime-1', ?, ?, 100, 'pending')
	`, `not-valid-json`, `{"_id":"anime-1"}`); err != nil {
		t.Fatalf("seed malformed conflict row: %v", err)
	}
	closeTestDB(t, legacyDB)

	if _, err := OpenBridgeDB(dbPath); err == nil {
		t.Fatal("expected bootstrap to fail on malformed conflict row")
	}

	// Reopen without running migration logic changes by inspecting raw content:
	// the anime_snapshots row must still hold its pre-migration Spanish bytes,
	// proving the failed transaction rolled back every table, not just the one
	// that failed.
	verifyDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("reopen db for verification: %v", err)
	}
	defer closeTestDB(t, verifyDB)
	var snapshotJSON string
	if err := verifyDB.QueryRow(`SELECT snapshot_json FROM anime_snapshots WHERE anime_id = ?`, "anime-1").Scan(&snapshotJSON); err != nil {
		t.Fatalf("read anime_snapshots row after failed migration: %v", err)
	}
	if snapshotJSON != `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":1}` {
		t.Fatalf("expected anime_snapshots row untouched by rolled-back migration, got %q", snapshotJSON)
	}
	migrated, err := vocabularyMigrationDone(verifyDB)
	if err != nil {
		t.Fatalf("check marker after failed migration: %v", err)
	}
	if migrated {
		t.Fatal("expected marker to remain unset after a rolled-back migration")
	}
}
