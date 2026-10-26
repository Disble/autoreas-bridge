package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"maps"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
)

// preChangeAnimeSnapshotsDDL is the table exactly as it shipped before the
// unique anime name index: every current column except name_key.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
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

// generatedNameKeyAnimeSnapshotsDDL is the table exactly as it shipped while
// name_key was a VIRTUAL generated column SQLite computed itself.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
const generatedNameKeyAnimeSnapshotsDDL = `
	CREATE TABLE anime_snapshots (
		anime_id TEXT PRIMARY KEY,
		snapshot_json TEXT NOT NULL,
		snapshot_hash TEXT NOT NULL,
		modified_at INTEGER NOT NULL DEFAULT 0,
		schedule_day_migrated_at INTEGER NOT NULL DEFAULT 0,
		vocabulary_migrated_at INTEGER NOT NULL DEFAULT 0,
		name_key TEXT GENERATED ALWAYS AS (CASE WHEN json_valid(snapshot_json)
			THEN lower(trim(json_extract(snapshot_json, '$.name'))) END) VIRTUAL
	)`

// insertAnimeNamed stores one snapshot carrying the given name through the
// snapshot store, the production writer.
func insertAnimeNamed(db *sql.DB, animeID, name string) error {
	return insertAnimeSnapshot(db, animeID, animeSnapshotNamed(animeID, name))
}

// insertAnimeSnapshot stores one raw snapshot through the snapshot store.
func insertAnimeSnapshot(db *sql.DB, animeID, snapshotJSON string) error {
	record := anime.SnapshotRecord{AnimeID: animeID, CanonicalJSON: []byte(snapshotJSON), Hash: "hash", ModifiedAt: 1}
	return NewAnimeSnapshotStore(db).ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{animeID: record}, nil)
}

// animeSnapshotNamed builds a minimal snapshot carrying the given name.
func animeSnapshotNamed(animeID, name string) string {
	encoded, _ := json.Marshal(map[string]string{"id": animeID, "name": name})
	return string(encoded)
}

// seedAnimeSnapshotRaw stores a snapshot without touching name_key, the way
// rows reached a table whose key SQLite computed or that had no key at all.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func seedAnimeSnapshotRaw(t *testing.T, db *sql.DB, animeID, snapshotJSON string) {
	t.Helper()
	if _, err := db.Exec(
		`INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash, modified_at) VALUES (?, ?, 'hash', 1)`,
		animeID, snapshotJSON); err != nil {
		t.Fatalf("seed %s: %v", animeID, err)
	}
}

// readNameKeys returns every stored anime's name_key by anime_id.
func readNameKeys(t *testing.T, db *sql.DB) map[string]sql.NullString {
	t.Helper()
	rows, err := db.Query(`SELECT anime_id, name_key FROM anime_snapshots`)
	if err != nil {
		t.Fatalf("read name keys: %v", err)
	}
	defer closeTestRows(t, rows)
	keys := map[string]sql.NullString{}
	for rows.Next() {
		var animeID string
		var key sql.NullString
		if err := rows.Scan(&animeID, &key); err != nil {
			t.Fatalf("scan name key: %v", err)
		}
		keys[animeID] = key
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate name keys: %v", err)
	}
	return keys
}

// readSchemaShape lists the table's columns with their hidden flag, plus every
// index on it, so a test can prove a failed migration left the schema alone.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func readSchemaShape(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`
		SELECT name || ':' || hidden FROM pragma_table_xinfo('anime_snapshots')
		UNION ALL
		SELECT 'index:' || name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'anime_snapshots'`)
	if err != nil {
		t.Fatalf("read schema shape: %v", err)
	}
	defer closeTestRows(t, rows)
	shape := []string{}
	for rows.Next() {
		var entry string
		if err := rows.Scan(&entry); err != nil {
			t.Fatalf("scan schema shape: %v", err)
		}
		shape = append(shape, entry)
	}
	return shape
}

// assertIntegrityOK fails unless PRAGMA integrity_check reports ok.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func assertIntegrityOK(t *testing.T, db *sql.DB) {
	t.Helper()
	if got := queryPragmaString(t, db, "integrity_check"); got != "ok" {
		t.Fatalf("integrity_check = %q, want ok", got)
	}
}

// TestAnimeNameKey pins the key rule SQLite's built-in lower(trim(...))
// produced: U+0020 trimmed, ASCII folded, every other rune kept, and NULL for a
// snapshot with no readable string name.
func TestAnimeNameKey(t *testing.T) {
	t.Parallel()

	cases := []struct {
		snapshot string
		want     sql.NullString
	}{
		{`{"name":"Date a Live Ⅲ"}`, sql.NullString{String: "date a live Ⅲ", Valid: true}},
		{`{"name":"  Tensei SHITARA  "}`, sql.NullString{String: "tensei shitara", Valid: true}},
		{`{"name":"\tOne Piece\t"}`, sql.NullString{String: "\tone piece\t", Valid: true}},
		{`{"name":"Inner   Spaces"}`, sql.NullString{String: "inner   spaces", Valid: true}},
		{`{"name":"ÉCOLE AZ@[` + "`" + `"}`, sql.NullString{String: "École az@[`", Valid: true}},
		{`{"name":"   "}`, sql.NullString{String: "", Valid: true}},
		{`{"id":"nameless"}`, sql.NullString{}},
		{`{"name":null}`, sql.NullString{}},
		{`{"name":12}`, sql.NullString{}},
		{`{"name":{"en":"x"}}`, sql.NullString{}},
		{`["name"]`, sql.NullString{}},
		{``, sql.NullString{}},
		{`{"name":"broken"`, sql.NullString{}},
	}
	for _, tc := range cases {
		if got := animeNameKey(tc.snapshot); got != tc.want {
			t.Errorf("animeNameKey(%s) = %#v, want %#v", tc.snapshot, got, tc.want)
		}
	}
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

// legacyNameKeySeeds are the rows an older database carries: names SQLite's
// own fold must keep, padding, and records without a readable name.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
var legacyNameKeySeeds = map[string]string{
	"roman":    `{"id":"roman","name":"Date a Live Ⅲ"}`,
	"padded":   `{"id":"padded","name":"  One Piece  "}`,
	"accented": `{"id":"accented","name":"ÉCOLE"}`,
	"nameless": `{"id":"nameless"}`,
	"empty":    ``,
}

// openOldShapeDB opens a database holding an older anime_snapshots schema
// (one or more statements) and the given raw rows.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func openOldShapeDB(t *testing.T, schema string, seeds map[string]string) *sql.DB {
	t.Helper()
	db := openNameUniquenessDB(t)
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("seed old schema: %v", err)
	}
	for animeID, snapshot := range seeds {
		seedAnimeSnapshotRaw(t, db, animeID, snapshot)
	}
	return db
}

// TestExistingDatabaseGainsThePlainNameKeyColumnAndItsIndex upgrades both
// older name_key shapes to the plain column.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func TestExistingDatabaseGainsThePlainNameKeyColumnAndItsIndex(t *testing.T) {
	for _, shape := range []struct{ name, schema string }{
		{"no name key", preChangeAnimeSnapshotsDDL},
		{"generated name key and its index", generatedNameKeyAnimeSnapshotsDDL + ";" + animeSnapshotsNameKeyIndexDDL},
	} {
		t.Run(shape.name, func(t *testing.T) { assertMigratesToPlainNameKey(t, shape.schema) })
	}
}

// assertMigratesToPlainNameKey migrates an old shape and checks the plain
// column, the keys SQLite's own fold produced, integrity and the unique index.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func assertMigratesToPlainNameKey(t *testing.T, schema string) {
	t.Helper()
	db := openOldShapeDB(t, schema, legacyNameKeySeeds)

	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("migrate an existing database: %v", err)
	}
	if shape := readSchemaShape(t, db); !slices.Contains(shape, "name_key:0") {
		t.Fatalf("name_key must become a plain column, got %v", shape)
	}
	want := map[string]sql.NullString{
		"roman":    {String: "date a live Ⅲ", Valid: true},
		"padded":   {String: "one piece", Valid: true},
		"accented": {String: "École", Valid: true},
		"nameless": {},
		"empty":    {},
	}
	if got := readNameKeys(t, db); !maps.Equal(got, want) {
		t.Fatalf("migrated keys = %v, want %v", got, want)
	}
	assertIntegrityOK(t, db)
	if err := insertAnimeNamed(db, "duplicate", "One Piece"); err == nil {
		t.Fatal("the migrated database must reject a duplicate name")
	}
}

// TestMigrationRepairsAnIndexDesyncedFromItsRows reproduces the incident: an
// index built under one fold while the generated column now computes another,
// which is what an ICU sqlite3 REINDEX left behind. Rebuilding the index from
// Go keys leaves the file consistent.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func TestMigrationRepairsAnIndexDesyncedFromItsRows(t *testing.T) {
	path := filepath.ToSlash(filepath.Join(t.TempDir(), "bridge.db"))
	db, err := sql.Open(sqliteDriverName, "file:"+path)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	for _, statement := range []string{generatedNameKeyAnimeSnapshotsDDL, animeSnapshotsNameKeyIndexDDL} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed old schema: %v", err)
		}
	}
	seedAnimeSnapshotRaw(t, db, "roman", legacyNameKeySeeds["roman"])
	for _, statement := range []string{
		`PRAGMA writable_schema = ON`,
		`UPDATE sqlite_master SET sql = replace(sql, 'lower(trim', 'upper(trim') WHERE name = 'anime_snapshots'`,
		`PRAGMA writable_schema = OFF`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("desync the generated column: %v", err)
		}
	}
	closeTestDB(t, db)

	db, err = sql.Open(sqliteDriverName, "file:"+path)
	if err != nil {
		t.Fatalf("reopen test database: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })
	if got := queryPragmaString(t, db, "integrity_check"); got == "ok" {
		t.Fatal("the fixture must start with an index desynced from its rows")
	}

	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("migrate a desynced database: %v", err)
	}
	assertIntegrityOK(t, db)
	if got := readNameKeys(t, db)["roman"]; got.String != "date a live Ⅲ" {
		t.Fatalf("roman key = %#v, want the Go fold", got)
	}
}

// TestMigrationNamesTheDuplicatesItCannotIndexAndLeavesTheSchemaUnchanged
// refuses to upgrade a catalogue with duplicate names.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func TestMigrationNamesTheDuplicatesItCannotIndexAndLeavesTheSchemaUnchanged(t *testing.T) {
	for _, shape := range []struct{ name, schema string }{
		{"no name key", preChangeAnimeSnapshotsDDL},
		{"generated name key without its index", generatedNameKeyAnimeSnapshotsDDL},
	} {
		t.Run(shape.name, func(t *testing.T) { assertRefusesDuplicateNameKeys(t, shape.schema) })
	}
}

// assertRefusesDuplicateNameKeys checks a migration over colliding names fails
// naming each key with its animes, and rolls the schema back untouched.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func assertRefusesDuplicateNameKeys(t *testing.T, schema string) {
	t.Helper()
	seeds := map[string]string{}
	for id, name := range map[string]string{
		"a": "Comic Girls", "b": "comic girls", "c": "Sayonara Lara", "d": "Sayonara Lara", "e": "Unique",
	} {
		seeds[id] = animeSnapshotNamed(id, name)
	}
	db := openOldShapeDB(t, schema, seeds)
	before := readSchemaShape(t, db)

	err := ensureAnimeSnapshotsSchema(db)
	if err == nil {
		t.Fatal("a database holding duplicate names cannot gain the index and must say so")
	}
	for _, want := range []string{`"comic girls" held by a, b`, `"sayonara lara" held by c, d`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the failure must name %s so it can be fixed, got: %v", want, err)
		}
	}
	if strings.Contains(err.Error(), `"unique"`) {
		t.Errorf("a name held once is not a duplicate, got: %v", err)
	}
	if after := readSchemaShape(t, db); !slices.Equal(before, after) {
		t.Fatalf("a refused migration must leave the schema unchanged: before %v, after %v", before, after)
	}
}

// TestMigrationIsIdempotentOverAnAlreadyMigratedDatabase proves a second open
// of an upgraded database leaves the stored keys alone.
//
// Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
func TestMigrationIsIdempotentOverAnAlreadyMigratedDatabase(t *testing.T) {
	db := openOldShapeDB(t, generatedNameKeyAnimeSnapshotsDDL,
		map[string]string{"kept": animeSnapshotNamed("kept", "One Piece")})
	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("first ensure: %v", err)
	}
	if _, err := db.Exec(`UPDATE anime_snapshots SET name_key = 'written by the app'`); err != nil {
		t.Fatalf("mark the stored key: %v", err)
	}

	if err := ensureAnimeSnapshotsSchema(db); err != nil {
		t.Fatalf("a second ensure over the same database must be a no-op: %v", err)
	}
	if got := readNameKeys(t, db); len(got) != 1 || got["kept"].String != "written by the app" {
		t.Fatalf("re-running the bootstrap must not touch stored rows, got %v", got)
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
		if err := insertAnimeSnapshot(db, record.animeID, record.snapshot); err != nil {
			t.Fatalf("a record with no readable name must still be storable (%s): %v", record.animeID, err)
		}
	}
}
