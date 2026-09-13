package sync

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/persistence"
	"autoreas-bridge/internal/watchhistory"
)

// backfillActivityRowSeed is one pre-existing audit-log row, built from the
// real row shape (untagged snapshot keys, CLAUDE.md #13): before/after each
// carry only NroCapVisto since the D3/D2 rules under test read no other
// field.
type backfillActivityRowSeed struct {
	animeID      string
	animeName    string
	actionType   string
	occurredAtMs int64
	beforeEp     float64
	afterEp      float64
}

// openPreBootstrapActivityDB opens a raw SQLite connection and creates the
// schema-migration marker table, the anime-identity table, and the audit
// log directly, bypassing OpenBridgeDB (which would immediately run the
// backfill) so a test can seed rows the backfill has never seen before its
// first real bootstrap -- mirroring openLegacyShapeDB's shape. Every DDL it
// runs is CREATE TABLE IF NOT EXISTS, so a later OpenBridgeDB call over the
// same file still works normally. watchTables additionally creates
// the watch-history projection's schema when true, for tests that call
// ensureWatchHistoryBackfill directly rather than through OpenBridgeDB.
func openPreBootstrapActivityDB(t *testing.T, dbPath string, watchTables bool) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open pre-bootstrap sqlite db: %v", err)
	}
	if _, err := db.Exec(schemaMigrationMarkersDDL); err != nil {
		closeTestDB(t, db)
		t.Fatalf("create pre-bootstrap schema_migration_markers table: %v", err)
	}
	if _, err := db.Exec(animeSnapshotsDDL); err != nil {
		closeTestDB(t, db)
		t.Fatalf("create pre-bootstrap anime_snapshots table: %v", err)
	}
	tables := activity.SchemaTables()
	if watchTables {
		tables = append(tables, watchhistory.SchemaTables()...)
	}
	for _, table := range tables {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			closeTestDB(t, db)
			t.Fatalf("create pre-bootstrap %s table: %v", table.Name, err)
		}
	}
	return db
}

// seedActivityLogRowForBackfill records one audit row through the public
// activity.Store API, so this file never writes that table's literal name
// (tools/checkarchitecture has no exception for it here).
func seedActivityLogRowForBackfill(t *testing.T, db *sql.DB, seed backfillActivityRowSeed) {
	t.Helper()
	store := activity.NewStore(activity.NewSQLiteProvider(db))
	before, err := json.Marshal(activity.Snapshot{NroCapVisto: seed.beforeEp, Activo: 1})
	if err != nil {
		t.Fatalf("marshal before snapshot: %v", err)
	}
	after, err := json.Marshal(activity.Snapshot{NroCapVisto: seed.afterEp, Activo: 1})
	if err != nil {
		t.Fatalf("marshal after snapshot: %v", err)
	}
	if err := store.RecordActivity(context.Background(), activity.Record{
		Source: activity.SourceDesktop, ActionType: seed.actionType, AnimeID: seed.animeID, AnimeName: seed.animeName,
		OccurredAtMs: seed.occurredAtMs, BeforeJSON: before, AfterJSON: after,
	}); err != nil {
		t.Fatalf("seed activity row for backfill: %v", err)
	}
}

// seedAnimeSnapshotRepetitions seeds a minimal anime_snapshots row whose
// repetitions array has exactly count entries, matching the real column the
// D3 cycle-alignment formula reads R from
// (json_array_length(json_extract(snapshot_json, '$.repetitions'))).
func seedAnimeSnapshotRepetitions(t *testing.T, db *sql.DB, animeID string, count int) {
	t.Helper()
	repetitions := make([]string, count)
	for i := range repetitions {
		repetitions[i] = `{}`
	}
	payload := fmt.Sprintf(`{"id":%q,"name":%q,"repetitions":[%s]}`, animeID, animeID, strings.Join(repetitions, ","))
	if _, err := db.Exec(
		`INSERT INTO anime_snapshots (anime_id, snapshot_json, snapshot_hash) VALUES (?, ?, ?)`,
		animeID, payload, "seed-hash",
	); err != nil {
		t.Fatalf("seed anime_snapshots repetitions for %s: %v", animeID, err)
	}
}

// TestCycleTrackerAnchorsBackwardsFromRepetitions covers design.md D3's three
// named fixtures directly against the pure tracker: the 59-of-61 default
// (R=3, K=0), the Date a Live II shape (R=1, K=1), a K>R collision, and an
// anime with no matching snapshot at all.
func TestCycleTrackerAnchorsBackwardsFromRepetitions(t *testing.T) {
	t.Parallel()
	const animeID = "anime-1"
	const reset = activity.ActionAnimeRepeated

	cases := []struct {
		name        string
		repetitions map[string]int64
		actionTypes []string
		wantCycles  []int64
	}{
		{
			name:        "R=3 K=0 every row lands on the final segment",
			repetitions: map[string]int64{animeID: 3},
			actionTypes: []string{"", "", ""},
			wantCycles:  []int64{4, 4, 4},
		},
		{
			name:        "R=1 K=1 pre-reset segment then post-reset segment",
			repetitions: map[string]int64{animeID: 1},
			actionTypes: []string{"", reset, ""},
			wantCycles:  []int64{1, 1, 2},
		},
		{
			name:        "K>R clamps every unreconstructable early row to cycle 1",
			repetitions: map[string]int64{animeID: 1},
			actionTypes: []string{"", reset, "", reset, "", reset, ""},
			wantCycles:  []int64{1, 1, 1, 1, 1, 1, 2},
		},
		{
			name:        "no matching snapshot defaults R to 0",
			repetitions: map[string]int64{},
			actionTypes: []string{""},
			wantCycles:  []int64{1},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			events := make([]activity.ProgressEvent, len(tc.actionTypes))
			for i, actionType := range tc.actionTypes {
				events[i] = activity.ProgressEvent{ID: int64(i + 1), AnimeID: animeID, ActionType: actionType}
			}
			tracker := newCycleTracker(events, tc.repetitions)
			got := make([]int64, len(events))
			for i, event := range events {
				got[i] = tracker.change(event).Cycle
			}
			if !slices.Equal(got, tc.wantCycles) {
				t.Fatalf("cycles = %v, want %v", got, tc.wantCycles)
			}
		})
	}
}

// TestEnsureWatchHistoryBackfillReplaysRealisticFixtureAndPurgesNavigationRows
// proves the end-to-end path against a fixture built from the real row shape
// (untagged snapshot keys): a progress run, a zero-delta navigation
// telemetry row (guard 3 -- Derive treats it as EffectNone regardless of its
// action_type, the diff-derived rule), a rollback, and -- scenario "An anime
// repeated before the log begins still aligns with live recording" -- a live
// write applied after the backfill landing on the same cycle R+1 the replay
// used. The real database's resulting row count is measured by the
// orchestrator against a sandbox copy (tasks.md 3.3.4); this fixture only
// proves the purge removes exactly the navigation row and keeps every
// progress row.
func TestEnsureWatchHistoryBackfillReplaysRealisticFixtureAndPurgesNavigationRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	preSeed := openPreBootstrapActivityDB(t, dbPath, false)
	// Progress 9->10, a zero-delta navigation telemetry row (purged), a
	// further progress step, then a rollback below it.
	steps := []struct {
		actionType        string
		occurredAtMs      int64
		beforeEp, afterEp float64
	}{
		{activity.ActionEpisodeAdjusted, 1000, 9, 10},
		{"anime_page_opened", 1500, 10, 10},
		{activity.ActionEpisodeAdjusted, 2000, 10, 11},
		{activity.ActionEpisodeAdjusted, 3000, 11, 10},
	}
	for _, step := range steps {
		seedActivityLogRowForBackfill(t, preSeed, backfillActivityRowSeed{
			animeID: "anime-1", animeName: "Anime One", actionType: step.actionType,
			occurredAtMs: step.occurredAtMs, beforeEp: step.beforeEp, afterEp: step.afterEp,
		})
	}
	seedAnimeSnapshotRepetitions(t, preSeed, "anime-1", 3)
	closeTestDB(t, preSeed)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with watch-history backfill: %v", err)
	}
	defer closeTestDB(t, db)

	watchStore := watchhistory.NewStore(db)
	page, err := watchStore.AnimePage(context.Background(), "anime-1", watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("read replayed anime page: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Episode != 10 || page.Items[0].Cycle != 4 {
		t.Fatalf("expected only episode 10 at cycle 4 (R+1=3+1) to survive the replayed rollback, got %#v", page.Items)
	}

	activityStore := activity.NewStore(activity.NewSQLiteProvider(db))
	remaining, err := activityStore.CountReplayable(context.Background())
	if err != nil {
		t.Fatalf("count remaining audit rows after purge: %v", err)
	}
	if remaining != 3 {
		t.Fatalf("expected the navigation row alone to be purged (3 of 4 rows survive), got %d", remaining)
	}

	if err := watchStore.Apply(context.Background(), watchhistory.Change{
		AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop",
		OccurredAtMS: 4000, BeforeEpisodes: 10, AfterEpisodes: 11, Cycle: 4,
	}); err != nil {
		t.Fatalf("apply live write after backfill: %v", err)
	}
	page, err = watchStore.AnimePage(context.Background(), "anime-1", watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("read anime page after live write: %v", err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("expected 2 rows after the live write, got %#v", page.Items)
	}
	for _, item := range page.Items {
		if item.Cycle != 4 {
			t.Fatalf("expected every row to share cycle 4 once the backfill and the live write agree, got %#v", page.Items)
		}
	}
}

// TestEnsureWatchHistoryBackfillDirectCallSucceedsOrFailsOnMissingSchema
// proves the driver's own return value directly, since OpenBridgeDB always
// swallows this error: the full schema commits and returns nil (killing a
// Comparison-Invert mutant on tx.Commit()'s error check -- the commit's SQL
// effect happens either way, only the returned error differs), while a
// database missing the watch-history table fails the first INSERT inside the
// transaction and sets no marker (design.md D6's "mid-replay failure rolls
// back" scenario).
func TestEnsureWatchHistoryBackfillDirectCallSucceedsOrFailsOnMissingSchema(t *testing.T) {
	cases := []struct {
		name              string
		createWatchTables bool
		wantErr           bool
	}{
		{name: "full schema commits and returns nil", createWatchTables: true, wantErr: false},
		{name: "missing watch-history table rolls back and returns an error", createWatchTables: false, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dbPath := filepath.Join(t.TempDir(), "bridge.db")
			db := openPreBootstrapActivityDB(t, dbPath, tc.createWatchTables)
			t.Cleanup(func() { closeTestDB(t, db) })
			seedActivityLogRowForBackfill(t, db, backfillActivityRowSeed{
				animeID: "anime-1", animeName: "Anime One", actionType: activity.ActionEpisodeAdjusted,
				occurredAtMs: 1000, beforeEp: 10, afterEp: 11,
			})

			err := ensureWatchHistoryBackfill(context.Background(), db, dbPath)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}

			migrated, doneErr := watchHistoryBackfillDone(db)
			if doneErr != nil {
				t.Fatalf("check watch-history backfill marker: %v", doneErr)
			}
			if migrated != !tc.wantErr {
				t.Fatalf("migrated = %v, want %v", migrated, !tc.wantErr)
			}
		})
	}
}

// TestOpenBridgeDBLogsWatchHistoryBackfillFailureWithoutFailingBootstrap
// proves the real bootstrap call site's own condition, not just
// ensureWatchHistoryBackfill's return value: a malformed audit row fails
// decoding before any transaction opens, and OpenBridgeDB still succeeds
// while logging the failure (design.md D6) -- killing a Comparison-Invert
// mutant on that call site's error check.
func TestOpenBridgeDBLogsWatchHistoryBackfillFailureWithoutFailingBootstrap(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	preSeed := openPreBootstrapActivityDB(t, dbPath, false)
	store := activity.NewStore(activity.NewSQLiteProvider(preSeed))
	if err := store.RecordActivity(context.Background(), activity.Record{
		Source: activity.SourceDesktop, ActionType: activity.ActionEpisodeAdjusted,
		AnimeID: "anime-1", AnimeName: "Anime One", OccurredAtMs: 1000,
		BeforeJSON: []byte("not-valid-json"), AfterJSON: []byte(`{"NroCapVisto":11}`),
	}); err != nil {
		t.Fatalf("seed malformed audit row: %v", err)
	}
	closeTestDB(t, preSeed)

	var logBuf bytes.Buffer
	original := log.Writer()
	log.SetOutput(&logBuf)
	t.Cleanup(func() { log.SetOutput(original) })

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("expected a backfill failure to degrade rather than fail bootstrap, got %v", err)
	}
	defer closeTestDB(t, db)

	if !strings.Contains(logBuf.String(), "watch-history backfill:") {
		t.Fatalf("expected the backfill failure to be logged, got %q", logBuf.String())
	}
}

// TestNewCycleTrackerLogsOnlyWhenResetsExceedRepetitions proves the R>=K
// boundary directly: K==R is the ordinary, reconstructable case and must
// NOT warn, only K>R must -- killing a Comparison mutant that inserts "="
// on the boundary check.
func TestNewCycleTrackerLogsOnlyWhenResetsExceedRepetitions(t *testing.T) {
	cases := []struct {
		name        string
		repetitions int64
		resetCount  int
		wantLog     bool
	}{
		{name: "K==R is the ordinary reconstructable case", repetitions: 1, resetCount: 1, wantLog: false},
		{name: "K>R collides and is warn-logged", repetitions: 1, resetCount: 3, wantLog: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			events := make([]activity.ProgressEvent, tc.resetCount)
			for i := range events {
				events[i] = activity.ProgressEvent{ID: int64(i + 1), AnimeID: "anime-1", ActionType: activity.ActionAnimeRepeated}
			}
			var logBuf bytes.Buffer
			original := log.Writer()
			log.SetOutput(&logBuf)
			defer log.SetOutput(original)

			newCycleTracker(events, map[string]int64{"anime-1": tc.repetitions})

			logged := strings.Contains(logBuf.String(), "anime-1")
			if logged != tc.wantLog {
				t.Fatalf("logged = %v, want %v (log: %q)", logged, tc.wantLog, logBuf.String())
			}
		})
	}
}

// TestWatchHistoryBackfillDoneTreatsZeroEpochAsNotDone proves the marker
// check's own boundary, mirroring vocabularyMigrationDone's equivalent
// semantic: a marker row with a zero epoch (the column's schema default) is
// NOT done, killing both an Integer-Decrement and an Integer-Increment
// mutant on the "!= 0" check that a real timestamp (always far from 0)
// cannot distinguish.
func TestWatchHistoryBackfillDoneTreatsZeroEpochAsNotDone(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { closeTestDB(t, db) })
	if _, err := db.Exec(schemaMigrationMarkersDDL); err != nil {
		t.Fatalf("create schema_migration_markers table: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO schema_migration_markers (marker, vocabulary_migrated_at) VALUES (?, 0)`,
		watchHistoryBackfillMarker,
	); err != nil {
		t.Fatalf("seed zero-epoch marker row: %v", err)
	}

	done, err := watchHistoryBackfillDone(db)
	if err != nil {
		t.Fatalf("check watch-history backfill marker: %v", err)
	}
	if done {
		t.Fatal("expected a zero-epoch marker row to be treated as not done")
	}
}

// TestEnsureWatchHistoryBackfillFreshInstallSetsMarkerWithoutRestorePoint
// proves scenario "fresh install": a database with no replayable rows sets
// the marker and creates no restore point (design.md D6) -- a new database
// has nothing worth protecting yet.
func TestEnsureWatchHistoryBackfillFreshInstallSetsMarkerWithoutRestorePoint(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer closeTestDB(t, db)

	migrated, err := watchHistoryBackfillDone(db)
	if err != nil {
		t.Fatalf("check watch-history backfill marker: %v", err)
	}
	if !migrated {
		t.Fatal("expected the marker to be set after a fresh install with nothing to replay")
	}

	entries, err := os.ReadDir(filepath.Dir(dbPath))
	if err != nil {
		t.Fatalf("read bridge db directory: %v", err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), RestorePointPrefix) {
			t.Fatalf("expected no restore point on a fresh install, found %q", entry.Name())
		}
	}
}

// TestEnsureWatchHistoryBackfillIsMarkerGuardedAndIdempotent proves scenario
// "Replaying the backfill twice yields the same rows": a second bootstrap
// skips the replay outright rather than merely converging on it, which a row
// inserted directly after the first bootstrap -- one the backfill would
// otherwise pick up -- proves by staying absent from the projection.
func TestEnsureWatchHistoryBackfillIsMarkerGuardedAndIdempotent(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	preSeed := openPreBootstrapActivityDB(t, dbPath, false)
	seedActivityLogRowForBackfill(t, preSeed, backfillActivityRowSeed{
		animeID: "anime-1", animeName: "Anime One", actionType: activity.ActionEpisodeAdjusted,
		occurredAtMs: 1000, beforeEp: 9, afterEp: 10,
	})
	seedAnimeSnapshotRepetitions(t, preSeed, "anime-1", 0)
	closeTestDB(t, preSeed)

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("first bootstrap: %v", err)
	}
	watchStore := watchhistory.NewStore(db)
	firstPage, err := watchStore.AnimePage(context.Background(), "anime-1", watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("read anime page after first bootstrap: %v", err)
	}

	// A row the second bootstrap would replay if the marker did not skip it
	// outright: a forward step for a DIFFERENT anime, never seen by the
	// first run.
	seedActivityLogRowForBackfill(t, db, backfillActivityRowSeed{
		animeID: "anime-2", animeName: "Anime Two", actionType: activity.ActionEpisodeAdjusted,
		occurredAtMs: 2000, beforeEp: 0, afterEp: 1,
	})
	closeTestDB(t, db)

	restarted, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("second bootstrap: %v", err)
	}
	defer closeTestDB(t, restarted)

	restartedStore := watchhistory.NewStore(restarted)
	secondPage, err := restartedStore.AnimePage(context.Background(), "anime-1", watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("read anime-1 page after second bootstrap: %v", err)
	}
	if len(secondPage.Items) != len(firstPage.Items) {
		t.Fatalf("expected anime-1's replayed rows unchanged, first=%#v second=%#v", firstPage.Items, secondPage.Items)
	}

	untouchedPage, err := restartedStore.AnimePage(context.Background(), "anime-2", watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("read anime-2 page after second bootstrap: %v", err)
	}
	if len(untouchedPage.Items) != 0 {
		t.Fatalf("expected the marker to skip a second run outright, but anime-2 was replayed: %#v", untouchedPage.Items)
	}
}

// TestEnsureWatchHistoryBackfillWarnLogsResetCollisionWithAnimeAndCounts
// proves scenario "Unreconstructable early cycles collapse into cycle 1":
// with R=1 and K=3, the collision is warn-logged naming the anime, R and K.
func TestEnsureWatchHistoryBackfillWarnLogsResetCollisionWithAnimeAndCounts(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	preSeed := openPreBootstrapActivityDB(t, dbPath, false)
	occurredAtMs := int64(1000)
	for i := 0; i < 3; i++ {
		seedActivityLogRowForBackfill(t, preSeed, backfillActivityRowSeed{
			animeID: "anime-1", animeName: "Anime One", actionType: activity.ActionEpisodeAdjusted,
			occurredAtMs: occurredAtMs, beforeEp: 10, afterEp: 11,
		})
		occurredAtMs++
		seedActivityLogRowForBackfill(t, preSeed, backfillActivityRowSeed{
			animeID: "anime-1", animeName: "Anime One", actionType: activity.ActionAnimeRepeated,
			occurredAtMs: occurredAtMs, beforeEp: 11, afterEp: 0,
		})
		occurredAtMs++
	}
	seedAnimeSnapshotRepetitions(t, preSeed, "anime-1", 1)
	closeTestDB(t, preSeed)

	var logBuf bytes.Buffer
	original := log.Writer()
	log.SetOutput(&logBuf)
	t.Cleanup(func() { log.SetOutput(original) })

	db, err := OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db with watch-history backfill: %v", err)
	}
	defer closeTestDB(t, db)

	logged := logBuf.String()
	if !strings.Contains(logged, "anime-1") || !strings.Contains(logged, "R=1") || !strings.Contains(logged, "K=3") {
		t.Fatalf("expected the reset-collision warning to name the anime, R and K, got %q", logged)
	}
}
