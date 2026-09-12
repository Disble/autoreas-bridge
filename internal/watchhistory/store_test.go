package watchhistory

import (
	"bytes"
	"context"
	"database/sql"
	"log"
	"slices"
	"strings"
	"testing"

	"autoreas-bridge/internal/persistence"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init
	// side effect and removing it turns every sql.Open("sqlite", ...) here
	// into a runtime error.
	_ "modernc.org/sqlite"
)

// openStoreTestDB opens an in-memory SQLite database with the watch_history
// schema already applied, mirroring eventlog/store_test.go's shape.
func openStoreTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, table := range SchemaTables() {
		if err := persistence.EnsureTableSchema(db, table); err != nil {
			t.Fatalf("ensure %s schema: %v", table.Name, err)
		}
	}
	return db
}

// recordedEpisodes returns every recorded episode number for one anime and
// cycle, ascending.
func recordedEpisodes(t *testing.T, db *sql.DB, animeID string, cycle int64) []int64 {
	t.Helper()
	rows, err := db.Query(`SELECT episode FROM watch_history WHERE anime_id = ? AND cycle = ? ORDER BY episode ASC`, animeID, cycle)
	if err != nil {
		t.Fatalf("query recorded episodes: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var episodes []int64
	for rows.Next() {
		var episode int64
		if err := rows.Scan(&episode); err != nil {
			t.Fatalf("scan episode: %v", err)
		}
		episodes = append(episodes, episode)
	}
	return episodes
}

// step builds a Change for anime-1 on the desktop source, so a table row
// varies only what its behavior cares about: the before/after episode
// bounds, the occurred-at timestamp, and the cycle.
func step(before, after float64, at, cycle int64) Change {
	return Change{
		AnimeID:        "anime-1",
		AnimeName:      "Anime One",
		Source:         "desktop",
		OccurredAtMS:   at,
		BeforeEpisodes: before,
		AfterEpisodes:  after,
		Cycle:          cycle,
	}
}

// stepSequenceCase is one row of TestApplyStepSequences: changes applied in
// order, and the episodes expected per cycle afterward.
type stepSequenceCase struct {
	name  string
	steps []Change
	want  map[int64][]int64
}

// assertStepSequence applies tc's steps to a fresh store and checks every
// cycle's episodes plus a zero conflict count. It takes the whole row so the
// table's loop stays under gocognit's limit of 15.
func assertStepSequence(t *testing.T, tc stepSequenceCase) {
	t.Helper()
	db := openStoreTestDB(t)
	store := NewStore(db)
	for i, change := range tc.steps {
		if err := store.Apply(context.Background(), change); err != nil {
			t.Fatalf("apply step %d: %v", i, err)
		}
	}
	for cycle, want := range tc.want {
		if got := recordedEpisodes(t, db, "anime-1", cycle); !slices.Equal(got, want) {
			t.Fatalf("cycle %d: expected %v, got %v", cycle, want, got)
		}
	}
	if got := store.Conflicts(); got != 0 {
		t.Fatalf("expected 0 conflicts, got %d", got)
	}
}

// TestApplyStepSequences covers a forward step, a retraction below the log's
// floor, a retraction above it, and cross-cycle isolation. Every row asserts
// zero conflicts, which kills an unconditional conflict-counter mutant.
func TestApplyStepSequences(t *testing.T) {
	t.Parallel()

	cases := []stepSequenceCase{
		{
			name:  "a forward step inserts the newly reached episode",
			steps: []Change{step(10, 11, 1000, 1)},
			want:  map[int64][]int64{1: {11}},
		},
		{
			name:  "a retraction below the log's floor is a no-op",
			steps: []Change{step(5, 3, 1000, 1)},
			want:  map[int64][]int64{1: nil},
		},
		{
			name: "a retraction above the floor deletes every row above the new value",
			steps: []Change{
				step(8, 9, 1000, 1),
				step(9, 10, 1001, 1),
				step(10, 11, 1002, 1),
				step(11, 9, 2000, 1),
			},
			want: map[int64][]int64{1: {9}},
		},
		{
			name: "a rollback in cycle 2 never touches cycle 1's rows",
			steps: []Change{
				step(0, 5, 1000, 1),
				step(0, 3, 2000, 2),
				step(3, 1, 3000, 2),
			},
			want: map[int64][]int64{
				1: {1, 2, 3, 4, 5},
				2: {1},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertStepSequence(t, tc)
		})
	}
}

// TestApplyOscillationLeavesSameSetWithNewRowIdentity asserts 11 -> 10.5 ->
// 11 leaves the same recorded set, but the surviving row's id and
// watched_at_ms belong to the re-reach, not the original.
func TestApplyOscillationLeavesSameSetWithNewRowIdentity(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	first := step(10, 11, 1000, 1)
	if err := store.Apply(ctx, first); err != nil {
		t.Fatalf("apply first reach: %v", err)
	}
	var firstID int64
	if err := db.QueryRow(`SELECT id FROM watch_history WHERE anime_id = ? AND cycle = ? AND episode = 11`, "anime-1", int64(1)).Scan(&firstID); err != nil {
		t.Fatalf("read first row id: %v", err)
	}

	retract := step(11, 10.5, 2000, 1)
	if err := store.Apply(ctx, retract); err != nil {
		t.Fatalf("apply half-step retraction: %v", err)
	}
	reReach := step(10.5, 11, 3000, 1)
	if err := store.Apply(ctx, reReach); err != nil {
		t.Fatalf("apply re-reach: %v", err)
	}

	if got := recordedEpisodes(t, db, "anime-1", 1); !slices.Equal(got, []int64{11}) {
		t.Fatalf("expected the final set to still be [11], got %v", got)
	}

	var secondID, watchedAtMS int64
	if err := db.QueryRow(`SELECT id, watched_at_ms FROM watch_history WHERE anime_id = ? AND cycle = ? AND episode = 11`, "anime-1", int64(1)).Scan(&secondID, &watchedAtMS); err != nil {
		t.Fatalf("read re-reached row: %v", err)
	}
	if secondID == firstID {
		t.Fatalf("expected the re-reach to carry a new row id, still got %d", firstID)
	}
	if watchedAtMS != 3000 {
		t.Fatalf("expected the re-reach to carry the re-reach's timestamp 3000, got %d", watchedAtMS)
	}
}

// TestApplyConflictingInsertIsANoOpCountedAndWarnLogged asserts a
// conflicting insert (which live traffic should never produce -- see
// design.md's natural-key rationale) is a no-op that is counted (design.md
// line 607: "the store counts conflicts") and warn-logged rather than
// silently swallowed.
func TestApplyConflictingInsertIsANoOpCountedAndWarnLogged(t *testing.T) {
	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	const insert = `INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source) VALUES (?, ?, ?, ?, ?, ?)`
	if _, err := db.Exec(insert, "anime-1", "Anime One", 8, 2, 1000, "desktop"); err != nil {
		t.Fatalf("seed existing row: %v", err)
	}

	if got := store.Conflicts(); got != 0 {
		t.Fatalf("expected 0 conflicts before the conflicting apply, got %d", got)
	}

	var logBuf bytes.Buffer
	originalOutput := log.Writer()
	log.SetOutput(&logBuf)
	t.Cleanup(func() { log.SetOutput(originalOutput) })

	change := step(7, 8, 2000, 2)
	if err := store.Apply(ctx, change); err != nil {
		t.Fatalf("expected a conflicting insert to be a no-op, got error: %v", err)
	}

	if got := recordedEpisodes(t, db, "anime-1", 2); !slices.Equal(got, []int64{8}) {
		t.Fatalf("expected exactly one row for (anime-1, cycle 2, episode 8), got %v", got)
	}
	logged := logBuf.String()
	if !strings.Contains(logged, "anime-1") || !strings.Contains(logged, "8") {
		t.Fatalf("expected the conflict to be warn-logged with the anime and episode, got %q", logged)
	}
	if got := store.Conflicts(); got != 1 {
		t.Fatalf("expected exactly 1 conflict after the conflicting apply, got %d", got)
	}
}

// TestApplyTxAppliesWithinCallersTransaction asserts ApplyTx participates in
// a transaction the caller controls, rather than opening its own.
func TestApplyTxAppliesWithinCallersTransaction(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	change := step(0, 1, 1000, 1)
	if err := store.ApplyTx(ctx, tx, change); err != nil {
		t.Fatalf("apply tx: %v", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback tx: %v", err)
	}

	if got := recordedEpisodes(t, db, "anime-1", 1); len(got) != 0 {
		t.Fatalf("expected the rolled-back transaction to leave no rows, got %v", got)
	}
}
