package watchhistory

import (
	"bytes"
	"context"
	"database/sql"
	"log"
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

// int64SlicesEqual reports whether two int64 slices hold the same values in
// the same order.
func int64SlicesEqual(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// TestApplySingleStepOutcomes exercises Apply for a single call against a
// fresh store, collapsing two single-step scenarios into one table (both
// share the same "one call, assert the resulting episode set" shape): a
// forward step inserts the newly reached episode, and a retraction below
// the log's floor -- nothing recorded yet above the new value -- is a no-op
// that neither errors nor writes anything.
func TestApplySingleStepOutcomes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		change Change
		want   []int64
	}{
		{
			name:   "a forward step inserts the newly reached episode",
			change: Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 10, AfterEpisodes: 11, Cycle: 1},
			want:   []int64{11},
		},
		{
			name:   "a retraction below the log's floor is a no-op",
			change: Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 5, AfterEpisodes: 3, Cycle: 1},
			want:   nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openStoreTestDB(t)
			store := NewStore(db)
			if err := store.Apply(context.Background(), tc.change); err != nil {
				t.Fatalf("apply: %v", err)
			}
			got := recordedEpisodes(t, db, "anime-1", 1)
			if !int64SlicesEqual(got, tc.want) {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

// TestApplyRetractsRowsAboveTheNewFloor asserts a backward step deletes
// every row above the new value and leaves the rest untouched.
func TestApplyRetractsRowsAboveTheNewFloor(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	for episode := int64(9); episode <= 11; episode++ {
		change := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: episode, BeforeEpisodes: float64(episode - 1), AfterEpisodes: float64(episode), Cycle: 1}
		if err := store.Apply(ctx, change); err != nil {
			t.Fatalf("apply forward step %d: %v", episode, err)
		}
	}

	rollback := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 2000, BeforeEpisodes: 11, AfterEpisodes: 9, Cycle: 1}
	if err := store.Apply(ctx, rollback); err != nil {
		t.Fatalf("apply rollback: %v", err)
	}

	got := recordedEpisodes(t, db, "anime-1", 1)
	if !int64SlicesEqual(got, []int64{9}) {
		t.Fatalf("expected only episode 9 to remain, got %v", got)
	}
}

// TestApplyRetractionIsScopedToOneCycle asserts a rollback in cycle 2 never
// touches cycle 1's rows.
func TestApplyRetractionIsScopedToOneCycle(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	cycle1 := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 0, AfterEpisodes: 5, Cycle: 1}
	if err := store.Apply(ctx, cycle1); err != nil {
		t.Fatalf("apply cycle 1: %v", err)
	}
	cycle2Forward := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 2000, BeforeEpisodes: 0, AfterEpisodes: 3, Cycle: 2}
	if err := store.Apply(ctx, cycle2Forward); err != nil {
		t.Fatalf("apply cycle 2 forward: %v", err)
	}
	cycle2Rollback := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 3000, BeforeEpisodes: 3, AfterEpisodes: 1, Cycle: 2}
	if err := store.Apply(ctx, cycle2Rollback); err != nil {
		t.Fatalf("apply cycle 2 rollback: %v", err)
	}

	cycle1Rows := recordedEpisodes(t, db, "anime-1", 1)
	if !int64SlicesEqual(cycle1Rows, []int64{1, 2, 3, 4, 5}) {
		t.Fatalf("expected cycle 1 untouched at [1 2 3 4 5], got %v", cycle1Rows)
	}
	cycle2Rows := recordedEpisodes(t, db, "anime-1", 2)
	if !int64SlicesEqual(cycle2Rows, []int64{1}) {
		t.Fatalf("expected cycle 2 to retain only episode 1, got %v", cycle2Rows)
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

	first := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 10, AfterEpisodes: 11, Cycle: 1}
	if err := store.Apply(ctx, first); err != nil {
		t.Fatalf("apply first reach: %v", err)
	}
	var firstID int64
	if err := db.QueryRow(`SELECT id FROM watch_history WHERE anime_id = ? AND cycle = ? AND episode = 11`, "anime-1", int64(1)).Scan(&firstID); err != nil {
		t.Fatalf("read first row id: %v", err)
	}

	retract := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 2000, BeforeEpisodes: 11, AfterEpisodes: 10.5, Cycle: 1}
	if err := store.Apply(ctx, retract); err != nil {
		t.Fatalf("apply half-step retraction: %v", err)
	}
	reReach := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 3000, BeforeEpisodes: 10.5, AfterEpisodes: 11, Cycle: 1}
	if err := store.Apply(ctx, reReach); err != nil {
		t.Fatalf("apply re-reach: %v", err)
	}

	got := recordedEpisodes(t, db, "anime-1", 1)
	if !int64SlicesEqual(got, []int64{11}) {
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

	change := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 2000, BeforeEpisodes: 7, AfterEpisodes: 8, Cycle: 2}
	if err := store.Apply(ctx, change); err != nil {
		t.Fatalf("expected a conflicting insert to be a no-op, got error: %v", err)
	}

	got := recordedEpisodes(t, db, "anime-1", 2)
	if !int64SlicesEqual(got, []int64{8}) {
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

// TestApplyOrdinaryInsertDoesNotIncrementConflicts asserts an ordinary,
// non-conflicting insert never advances the conflict counter -- without
// this, a mutant that increments unconditionally survives.
func TestApplyOrdinaryInsertDoesNotIncrementConflicts(t *testing.T) {
	t.Parallel()

	db := openStoreTestDB(t)
	store := NewStore(db)
	ctx := context.Background()

	change := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 10, AfterEpisodes: 11, Cycle: 1}
	if err := store.Apply(ctx, change); err != nil {
		t.Fatalf("apply: %v", err)
	}

	if got := store.Conflicts(); got != 0 {
		t.Fatalf("expected 0 conflicts after an ordinary insert, got %d", got)
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
	change := Change{AnimeID: "anime-1", AnimeName: "Anime One", Source: "desktop", OccurredAtMS: 1000, BeforeEpisodes: 0, AfterEpisodes: 1, Cycle: 1}
	if err := store.ApplyTx(ctx, tx, change); err != nil {
		t.Fatalf("apply tx: %v", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback tx: %v", err)
	}

	got := recordedEpisodes(t, db, "anime-1", 1)
	if len(got) != 0 {
		t.Fatalf("expected the rolled-back transaction to leave no rows, got %v", got)
	}
}
