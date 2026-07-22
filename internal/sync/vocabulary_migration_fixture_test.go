package sync

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestVocabularyMigrationZeroDataLossOnRealFixture proves scenario "Zero data
// loss verified on a real fixture": a database populated from a real
// pre-cutover stored snapshot (cloned into t.TempDir(), the real fixture file
// under testdata/ is never mutated) survives the migration with every field
// value intact, decodable through the English-only codec afterward.
func TestVocabularyMigrationZeroDataLossOnRealFixture(t *testing.T) {
	t.Parallel()
	fixture, err := os.ReadFile(filepath.Join("testdata", "real_snapshot_shape_spanish.jsonl"))
	if err != nil {
		t.Fatalf("read cloned real fixture: %v", err)
	}

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	legacyDB := openLegacyShapeDB(t, dbPath)
	insertLegacyAnimeSnapshotRow(t, legacyDB, "10wvY4Q7seDrCiek", string(fixture), "stale-hash", 12345)
	closeTestDB(t, legacyDB)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("bootstrap bridge db with real fixture: %v", err)
	}
	defer closeTestDB(t, db)

	var snapshotJSON string
	if err := db.QueryRow(`SELECT snapshot_json FROM anime_snapshots WHERE anime_id = ?`, "10wvY4Q7seDrCiek").Scan(&snapshotJSON); err != nil {
		t.Fatalf("read migrated real fixture row: %v", err)
	}

	var before, after map[string]any
	beforeDecoder := json.NewDecoder(newSpanishFixtureReader(fixture))
	beforeDecoder.UseNumber()
	if err := beforeDecoder.Decode(&before); err != nil {
		t.Fatalf("decode original fixture: %v", err)
	}
	afterDecoder := json.NewDecoder(bytes.NewReader([]byte(snapshotJSON)))
	afterDecoder.UseNumber()
	if err := afterDecoder.Decode(&after); err != nil {
		t.Fatalf("decode migrated fixture: %v", err)
	}

	wantByEnglishKey := map[string]string{
		"nombre": "name", "nrocapvisto": "episodesWatched", "estado": "status",
		"tipo": "kind", "pagina": "sourceUrl", "carpeta": "folder",
		"origen": "origin", "duracion": "durationMinutes", "activo": "active",
		"primeravez": "firstCycle", "totalcap": "totalEpisodes",
	}
	for spanish, english := range wantByEnglishKey {
		if before[spanish] != after[english] {
			t.Fatalf("field %q -> %q value changed: before=%#v after=%#v", spanish, english, before[spanish], after[english])
		}
	}
	if after["id"] != before["_id"] {
		t.Fatalf("id changed: before=%#v after=%#v", before["_id"], after["id"])
	}
	// fechaPublicacion is not in the approved rename map and must survive untouched.
	if _, ok := after["fechaPublicacion"]; !ok {
		t.Fatal("expected unrecognized fechaPublicacion key to survive the migration untouched")
	}
}
