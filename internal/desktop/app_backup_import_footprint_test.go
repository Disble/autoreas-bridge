package desktop

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/backup"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
)

// declaredImportGroupFootprints is the guard's registry: every shipped
// import group name mapped to the exact footprint label
// (footprintFields' keys) it is permitted to modify. A group present in
// app.importGroups() with no entry here fails the guard -- proven by
// TestUndeclaredImportGroupFailsTheFootprintGuard's deliberate inversion.
var declaredImportGroupFootprints = map[string]string{
	"anime_snapshots": "anime_snapshots",
	"seasons":         "seasons",
	"season_animes":   "season_animes",
	"keyboard_keymap": "keyboard.keymap",
}

// footprintSnapshot is a comparable dump of every table and app_settings key
// any shipped import group can touch -- exactly the scope
// TestImportGroupFootprintsAreDeclaredAndRespected checks, no more and no
// less (design.md D3).
type footprintSnapshot struct {
	animeSnapshots       string
	seasons              string
	seasonAnimes         string
	settingsExceptKeymap map[string]string
	keymap               string
}

// footprintFields flattens a snapshot into label->value pairs, one per
// declared footprint plus the leftover app_settings keys, so the guard can
// compare a single field for equality without special-casing each table.
func footprintFields(snap footprintSnapshot) map[string]string {
	return map[string]string{
		"anime_snapshots":            snap.animeSnapshots,
		"seasons":                    snap.seasons,
		"season_animes":              snap.seasonAnimes,
		"app_settings_except_keymap": encodeSettingsSnapshot(snap.settingsExceptKeymap),
		"keyboard.keymap":            snap.keymap,
	}
}

// encodeSettingsSnapshot renders a key/value map as a deterministic string
// so two snapshots compare with plain string equality regardless of map
// iteration order.
func encodeSettingsSnapshot(values map[string]string) string {
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var sb strings.Builder
	for _, k := range keys {
		fmt.Fprintf(&sb, "%s=%s;", k, values[k])
	}
	return sb.String()
}

// dumpTable returns a deterministic dump of every row in table, generic
// over column names via rows.Columns() -- a schema change is captured by
// construction, never by naming a column here. table is always one of this
// file's own fixed names, never external input.
func dumpTable(t *testing.T, db *sql.DB, table string) string {
	t.Helper()

	rows, err := db.QueryContext(context.Background(), "SELECT * FROM "+table)
	if err != nil {
		t.Fatalf("dump table %q: %v", table, err)
	}
	defer func() { _ = rows.Close() }()

	cols, err := rows.Columns()
	if err != nil {
		t.Fatalf("read columns for %q: %v", table, err)
	}

	var sb strings.Builder
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatalf("scan row from %q: %v", table, err)
		}
		for i, v := range values {
			if raw, ok := v.([]byte); ok {
				v = string(raw)
			}
			fmt.Fprintf(&sb, "%s=%v;", cols[i], v)
		}
		sb.WriteByte('\n')
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate rows from %q: %v", table, err)
	}
	return sb.String()
}

// snapshotFootprintState dumps every table/key any shipped import group can
// touch. app_settings keys other than keyboard.keymap are captured through
// the existing snapshotAppSettingsExcludingKeymap scan (never enumerated by
// name), so a newly added key is covered by construction.
func snapshotFootprintState(t *testing.T, db *sql.DB) footprintSnapshot {
	t.Helper()

	keymap, err := settings.NewSQLiteStore(db).Keymap(context.Background())
	if err != nil {
		t.Fatalf("read keymap: %v", err)
	}
	return footprintSnapshot{
		animeSnapshots:       dumpTable(t, db, "anime_snapshots"),
		seasons:              dumpTable(t, db, "seasons"),
		seasonAnimes:         dumpTable(t, db, "season_animes"),
		settingsExceptKeymap: snapshotAppSettingsExcludingKeymap(t, db),
		keymap:               keymap,
	}
}

// footprintFixtureIDs names the rows seedFootprintFixture creates, so
// mutateFootprintFixture updates the SAME primary keys instead of inserting
// new ones -- a fresh row is not a mutation of the seeded one.
type footprintFixtureIDs struct {
	seasonID      string
	seasonAnimeID string
}

// seedFootprintFixture creates one row for every import-group footprint --
// anime_snapshots, seasons, season_animes, and
// app_settings["keyboard.keymap"] -- all tagged with marker, and returns the
// season/season-anime ids so a later mutateFootprintFixture call updates
// these SAME rows rather than adding new ones.
func seedFootprintFixture(t *testing.T, db *sql.DB, marker string) footprintFixtureIDs {
	t.Helper()
	ctx := context.Background()

	setAnimeSnapshotMarker(t, db, marker)

	seasonStore := season.NewSQLiteStore(db)
	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason("footprint-season", marker, now)
	if err := seasonStore.CreateSeason(ctx, s); err != nil {
		t.Fatalf("seed season: %v", err)
	}

	sa := domain.NewSeasonAnime("footprint-season-anime", s.ID, "footprint-raw-name", now)
	sa.MatchedSlug = marker
	if err := seasonStore.CreateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("seed season anime: %v", err)
	}

	if err := settings.NewSQLiteStore(db).SetKeymap(ctx, marker); err != nil {
		t.Fatalf("seed keymap: %v", err)
	}

	return footprintFixtureIDs{seasonID: s.ID, seasonAnimeID: sa.ID}
}

// mutateFootprintFixture updates the SAME rows seedFootprintFixture created
// to a distinct marker -- state B. It never inserts a new row: a distinct
// primary key would let "everything outside the footprint is
// byte-identical to B" pass even if the import silently reached a row it
// should not have.
func mutateFootprintFixture(t *testing.T, db *sql.DB, ids footprintFixtureIDs, marker string) {
	t.Helper()
	ctx := context.Background()

	setAnimeSnapshotMarker(t, db, marker)

	seasonStore := season.NewSQLiteStore(db)
	now := time.UnixMilli(1_700_000_000_000)
	s := domain.NewSeason(ids.seasonID, marker, now)
	if err := seasonStore.UpdateSeason(ctx, s); err != nil {
		t.Fatalf("mutate season: %v", err)
	}

	sa := domain.NewSeasonAnime(ids.seasonAnimeID, ids.seasonID, "footprint-raw-name", now)
	sa.MatchedSlug = marker
	if err := seasonStore.UpdateSeasonAnime(ctx, sa); err != nil {
		t.Fatalf("mutate season anime: %v", err)
	}

	if err := settings.NewSQLiteStore(db).SetKeymap(ctx, marker); err != nil {
		t.Fatalf("mutate keymap: %v", err)
	}
}

// setAnimeSnapshotMarker upserts the single footprint-owned anime_snapshots
// row (fixed anime_id) with marker as its content, so seeding and mutating
// touch the SAME row instead of inserting a second one.
func setAnimeSnapshotMarker(t *testing.T, db *sql.DB, marker string) {
	t.Helper()

	body := []byte(fmt.Sprintf(`{"id":"footprint-anime","marker":%q}`, marker))
	store := bridgeSync.NewAnimeSnapshotStore(db)
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		"footprint-anime": {AnimeID: "footprint-anime", CanonicalJSON: body, Hash: anime.HashSnapshot(body)},
	}, nil); err != nil {
		t.Fatalf("set anime snapshot marker: %v", err)
	}
}

// footprintTestApp wires a fresh, fully bootstrapped bridge DB for both the
// export half (ExportBackup, via saveFile) and the import half (backup.Apply
// needs nothing beyond bridgeDB) of the footprint guard.
func footprintTestApp(t *testing.T) *App {
	t.Helper()

	app, _ := appBackupImportTestApp(t)
	app.saveFile = func(context.Context, string, string) (string, error) {
		return filepath.Join(t.TempDir(), "footprint-backup.zip"), nil
	}
	return app
}

// importGroupNamed returns the entry in groups whose Name matches name,
// failing the test if none matches -- used to isolate exactly one shipped
// group for backup.Apply, per design.md D3.
func importGroupNamed(t *testing.T, groups []backup.ImportGroup, name string) backup.ImportGroup {
	t.Helper()

	for _, g := range groups {
		if g.Name == name {
			return g
		}
	}
	t.Fatalf("import group %q not found", name)
	return backup.ImportGroup{}
}

// undeclaredImportGroups returns the Name of every entry in groups absent
// from declared -- empty when every group has a declared footprint. Kept
// pure (no *testing.T) so both the passing and the deliberately-failing
// case in this file exercise the identical code path.
func undeclaredImportGroups(groups []backup.ImportGroup, declared map[string]string) []string {
	var undeclared []string
	for _, g := range groups {
		if _, ok := declared[g.Name]; !ok {
			undeclared = append(undeclared, g.Name)
		}
	}
	return undeclared
}

// assertFootprintRespected checks that after importing exactly one group,
// its declared footprint reads back the pre-mutation value (stateA) while
// every other footprint field still reads the post-mutation value (stateB)
// -- design.md D3's two-state proof. Comparing against stateB, not merely
// asserting "still equals A", is what makes the mutation step load-bearing:
// a bundle round-tripped into its own unmutated database would pass this
// check even if the import silently touched everything.
func assertFootprintRespected(t *testing.T, stateA, stateB, after footprintSnapshot, ownLabel string) {
	t.Helper()

	want := footprintFields(stateB)
	want[ownLabel] = footprintFields(stateA)[ownLabel]

	got := footprintFields(after)
	for label, wantValue := range want {
		if gotValue := got[label]; gotValue != wantValue {
			t.Fatalf("footprint field %q: want %q, got %q (declared footprint under test: %q)", label, wantValue, gotValue, ownLabel)
		}
	}
}

// assertGroupRespectsItsFootprint runs the seed-A/export/mutate-B/apply-one/
// assert cycle for a single group name against a fresh database. Kept as a
// top-level helper (not inlined in the table loop) so its branches sit at
// gocognit nesting level 0.
func assertGroupRespectsItsFootprint(t *testing.T, groupName string) {
	t.Helper()

	app := footprintTestApp(t)
	ids := seedFootprintFixture(t, app.bridgeDB, "state-a")
	stateA := snapshotFootprintState(t, app.bridgeDB)

	result, err := app.ExportBackup()
	if err != nil {
		t.Fatalf("export backup: %v", err)
	}

	mutateFootprintFixture(t, app.bridgeDB, ids, "state-b")
	stateB := snapshotFootprintState(t, app.bridgeDB)

	oneGroup := importGroupNamed(t, app.importGroups(), groupName)
	if _, err := backup.Apply(context.Background(), result.DestinationPath, []backup.ImportGroup{oneGroup}); err != nil {
		t.Fatalf("apply group %q: %v", groupName, err)
	}

	after := snapshotFootprintState(t, app.bridgeDB)
	assertFootprintRespected(t, stateA, stateB, after, declaredImportGroupFootprints[groupName])
}

// TestImportGroupFootprintsAreDeclaredAndRespected closes "An Importer
// Modifies Only Its Declared Footprint": table-driven over the REAL
// app.importGroups() slice (design.md D3). For each group: seed state A
// across every table and app_settings["keyboard.keymap"], export a full
// bundle, mutate everything to a distinct state B, apply ONLY that group
// from the bundle, then assert its declared footprint reads back A while
// everything else still reads B, byte for byte.
func TestImportGroupFootprintsAreDeclaredAndRespected(t *testing.T) {
	app := footprintTestApp(t)

	groups := app.importGroups()
	if undeclared := undeclaredImportGroups(groups, declaredImportGroupFootprints); len(undeclared) != 0 {
		t.Fatalf("import groups with no declared footprint: %v", undeclared)
	}

	for _, g := range groups {
		t.Run(g.Name, func(t *testing.T) {
			assertGroupRespectsItsFootprint(t, g.Name)
		})
	}
}

// TestUndeclaredImportGroupFailsTheFootprintGuard is the deliberate
// inversion: a synthetic group appended to a local copy of the shipped
// slice, absent from declaredImportGroupFootprints, MUST be reported by
// undeclaredImportGroups -- proving the guard's failure path actually
// fires, the same shape as the APP_LAYOUT_NAV_GROUPS coverage test
// (frontend/src/shared/keyboard/__tests__/command-registry.constants.test.ts).
func TestUndeclaredImportGroupFailsTheFootprintGuard(t *testing.T) {
	app := footprintTestApp(t)
	local := append(slices.Clone(app.importGroups()), backup.ImportGroup{Name: "synthetic_undeclared_group"})

	undeclared := undeclaredImportGroups(local, declaredImportGroupFootprints)
	if len(undeclared) != 1 || undeclared[0] != "synthetic_undeclared_group" {
		t.Fatalf(`expected exactly ["synthetic_undeclared_group"] reported undeclared, got %v`, undeclared)
	}
}
