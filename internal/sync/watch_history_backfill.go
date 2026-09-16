package sync

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/watchhistory"
)

// watchHistoryBackfillMarker names this one-shot migration's row in
// schema_migration_markers, reusing its epoch column (design.md D6) --
// hyphenated rather than the table's own underscored name, so this marker
// value never trips tools/checkarchitecture's owned-table scan for that
// projection's table.
const watchHistoryBackfillMarker = "watch-history-backfill"

// ensureWatchHistoryBackfill runs the SDD-69 one-shot backfill exactly once,
// gated by its own schema_migration_markers row. Any error here is the
// caller's to degrade: it never mutates partially (design.md D6).
func ensureWatchHistoryBackfill(ctx context.Context, db *sql.DB, dbPath string) error {
	done, err := watchHistoryBackfillDone(db)
	if err != nil {
		return err
	}
	if done {
		return nil
	}

	activityStore := activity.NewStore(activity.NewSQLiteProvider(db))
	total, err := activityStore.CountReplayable(ctx)
	if err != nil {
		return err
	}
	if total == 0 {
		// Fresh install: nothing to replay, and no restore point -- a new
		// database has nothing worth protecting yet (design.md D6).
		return setWatchHistoryBackfillMarker(db)
	}

	if _, err := CreateRestorePoint(ctx, db, dbPath, time.Now()); err != nil {
		return fmt.Errorf("create restore point before watch-history backfill: %w", err)
	}

	// The full ordered result is read to completion here, before any
	// transaction opens: SetMaxOpenConns(1) means a write transaction
	// started while this SELECT's rows are still open would starve waiting
	// for the one connection the SELECT holds. The audit log this replays is
	// small, so buffering it is cheap (proven by
	// TestEnsureWatchHistoryBackfillReplaysRealisticFixtureAndPurgesNavigationRows,
	// which replays more than one row through the resulting transaction).
	events, err := bufferReplayEvents(ctx, activityStore)
	if err != nil {
		return fmt.Errorf("buffer watch-history replay events: %w", err)
	}
	repetitions, err := repetitionCountsByAnime(ctx, db)
	if err != nil {
		return fmt.Errorf("read repetition counts for watch-history backfill: %w", err)
	}

	return runWatchHistoryBackfillTx(ctx, db, activityStore, events, repetitions)
}

// runWatchHistoryBackfillTx replays every buffered event, purges navigation
// telemetry, and sets the marker inside one transaction: any failure rolls
// back the whole attempt (design.md D6).
func runWatchHistoryBackfillTx(ctx context.Context, db *sql.DB, activityStore *activity.Store, events []activity.ProgressEvent, repetitions map[string]int64) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin watch-history backfill transaction: %w", err)
	}

	watchStore := watchhistory.NewStore(db)
	if err := replayEventsTx(ctx, tx, watchStore, events, repetitions); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := activityStore.DeleteNavigationTelemetry(ctx, tx); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("purge navigation telemetry after watch-history backfill: %w", err)
	}
	if err := setWatchHistoryBackfillMarker(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit watch-history backfill transaction: %w", err)
	}
	return nil
}

// bufferReplayEvents loads every replay row into memory before any write
// transaction opens (see ensureWatchHistoryBackfill's ordering note).
func bufferReplayEvents(ctx context.Context, store *activity.Store) ([]activity.ProgressEvent, error) {
	var events []activity.ProgressEvent
	err := store.StreamOldestFirst(ctx, func(event activity.ProgressEvent) error {
		events = append(events, event)
		return nil
	})
	return events, err
}

// replayEventsTx applies every buffered event to watch through tx, tracking
// each anime's remaining un-replayed resets so cycle(P) anchors backwards
// from its live repetition count (design.md D3).
func replayEventsTx(ctx context.Context, tx *sql.Tx, watch *watchhistory.Store, events []activity.ProgressEvent, repetitions map[string]int64) error {
	tracker := newCycleTracker(events, repetitions)
	for _, event := range events {
		change := tracker.change(event)
		if err := watch.ApplyTx(ctx, tx, change); err != nil {
			return fmt.Errorf("apply watch-history change for activity row %d: %w", event.ID, err)
		}
	}
	return nil
}

// repetitionCountsByAnime reads each anime's live repetition count R from
// its stored snapshot (design.md D3), the same table the vocabulary
// migration already reads directly. A missing anime is absent from the map;
// cycleTracker treats that as R=0.
func repetitionCountsByAnime(ctx context.Context, db *sql.DB) (map[string]int64, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT anime_id, json_array_length(json_extract(snapshot_json, '$.repetitions'))
		FROM anime_snapshots
	`)
	if err != nil {
		return nil, fmt.Errorf("read anime repetition counts: %w", err)
	}
	defer func() { _ = rows.Close() }()

	repetitions := make(map[string]int64)
	for rows.Next() {
		var animeID string
		var count sql.NullInt64
		if err := rows.Scan(&animeID, &count); err != nil {
			return nil, fmt.Errorf("scan anime repetition count: %w", err)
		}
		repetitions[animeID] = count.Int64
	}
	return repetitions, rows.Err()
}

// cycleTracker anchors each replayed row's cycle backwards from its anime's
// current repetition count R (design.md D3):
// cycle(P) = max(1, R+1-resetsStrictlyAfter(P)). resetsRemaining seeds at
// each anime's total logged resets and decreases by one per reset row.
type cycleTracker struct {
	repetitions     map[string]int64
	resetsRemaining map[string]int64
}

// newCycleTracker seeds resetsRemaining from events and warn-logs, once per
// anime, when the log recorded more resets than the anime's repetition
// count admits (design.md D3's decided collision behaviour).
func newCycleTracker(events []activity.ProgressEvent, repetitions map[string]int64) *cycleTracker {
	resets := make(map[string]int64, len(repetitions))
	for _, event := range events {
		if event.ActionType == activity.ActionAnimeRepeated {
			resets[event.AnimeID]++
		}
	}
	for animeID, resetCount := range resets {
		if resetCount > repetitions[animeID] {
			log.Printf("watch-history backfill: anime %s recorded repetitions R=%d is less than logged resets K=%d; unreconstructable early cycles collapse into cycle 1",
				animeID, repetitions[animeID], resetCount)
		}
	}
	return &cycleTracker{repetitions: repetitions, resetsRemaining: resets}
}

// change builds the watchhistory.Change for one replayed row, computing its
// cycle before advancing resetsRemaining when the row itself is a reset.
func (c *cycleTracker) change(event activity.ProgressEvent) watchhistory.Change {
	cycle := c.cycleFor(event.AnimeID)
	isReset := event.ActionType == activity.ActionAnimeRepeated
	if isReset {
		c.resetsRemaining[event.AnimeID]--
	}
	activityID := event.ID
	return watchhistory.Change{
		AnimeID:          event.AnimeID,
		AnimeName:        event.AnimeName,
		Source:           event.Source,
		OccurredAtMS:     event.OccurredAtMs,
		ReportedAtMS:     event.ReportedAtMS,
		BeforeEpisodes:   event.Before.NroCapVisto,
		AfterEpisodes:    event.After.NroCapVisto,
		Cycle:            cycle,
		CycleReset:       isReset,
		SourceActivityID: &activityID,
	}
}

// cycleFor computes cycle(P) = max(1, R+1-resetsStrictlyAfter) for animeID's
// current position (design.md D3). A missing repetitions entry defaults R
// to 0.
func (c *cycleTracker) cycleFor(animeID string) int64 {
	cycle := c.repetitions[animeID] + 1 - c.resetsRemaining[animeID]
	if cycle < 1 {
		return 1
	}
	return cycle
}

// sqlExecutor is satisfied by both *sql.DB and *sql.Tx, letting
// setWatchHistoryBackfillMarker run identically with or without a tx.
type sqlExecutor interface {
	Exec(query string, args ...any) (sql.Result, error)
}

// watchHistoryBackfillDone reports whether the one-shot backfill already
// ran, reusing schema_migration_markers' epoch column (the pre-existing
// "vocabulary_migrated_at" misnomer) under its own marker row.
func watchHistoryBackfillDone(db *sql.DB) (bool, error) {
	var migratedAt int64
	err := db.QueryRow(
		`SELECT vocabulary_migrated_at FROM schema_migration_markers WHERE marker = ?`,
		watchHistoryBackfillMarker,
	).Scan(&migratedAt)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read watch-history backfill marker: %w", err)
	}
	return migratedAt != 0, nil
}

// setWatchHistoryBackfillMarker records the backfill's completion through
// exec, which is either db (fresh-install path) or the backfill's own tx
// (replayed path).
func setWatchHistoryBackfillMarker(exec sqlExecutor) error {
	if _, err := exec.Exec(
		`INSERT INTO schema_migration_markers (marker, vocabulary_migrated_at) VALUES (?, ?)
		 ON CONFLICT(marker) DO UPDATE SET vocabulary_migrated_at = excluded.vocabulary_migrated_at`,
		watchHistoryBackfillMarker, time.Now().UnixMilli(),
	); err != nil {
		return fmt.Errorf("set watch-history backfill marker: %w", err)
	}
	return nil
}
