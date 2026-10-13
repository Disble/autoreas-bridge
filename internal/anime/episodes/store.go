package episodes

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/persistence"
)

// Source values record who wrote an episode's current duration. It is
// overwritten together with the value and is never a history (analysis D0).
const (
	// SourceMeasured marks a duration read from the episode's file.
	SourceMeasured = "measured"
	// SourceManual marks a duration the user typed in the Editor.
	SourceManual = "manual"
)

var (
	// ErrEmptyAnimeID rejects a write with no anime id.
	ErrEmptyAnimeID = errors.New("episodes: anime id is empty")
	// ErrInvalidEpisode rejects an episode number below 1; half episodes
	// are out of scope, so the type is a whole number.
	ErrInvalidEpisode = errors.New("episodes: episode must be at least 1")
	// ErrInvalidDuration rejects a duration that is not positive.
	ErrInvalidDuration = errors.New("episodes: duration must be positive")
)

// Reading is one episode's duration as a writer offers it.
type Reading struct {
	// Episode is the whole episode number, starting at 1.
	Episode int
	// DurationMS is the episode's runtime in milliseconds.
	DurationMS int64
}

// Duration is one stored episode duration.
type Duration struct {
	// AnimeID is the anime the episode belongs to.
	AnimeID string
	// Episode is the whole episode number, starting at 1.
	Episode int
	// DurationMS is the episode's runtime in milliseconds.
	DurationMS int64
	// Source is SourceMeasured or SourceManual: who set the current value.
	Source string
	// UpdatedAtMS is when the current value was written.
	UpdatedAtMS int64
}

// Pending is one anime whose durations changed and are not announced yet.
type Pending struct {
	// AnimeID is the anime to announce.
	AnimeID string
	// MarkedAtMS identifies this mark; ClearPending removes the row only
	// while it still carries this value.
	MarkedAtMS int64
}

// Store persists episode durations and marks every changed anime for
// announcement in the same transaction as the duration write.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// NewStore builds a SQLite-backed duration store; now supplies every
// updated_at_ms and marked_at_ms the store writes.
func NewStore(db *sql.DB, now func() time.Time) *Store {
	return &Store{db: db, now: now}
}

const (
	// fillGapSQL inserts a measured reading only where no row exists.
	fillGapSQL = `
		INSERT INTO anime_episode_durations (anime_id, episode, duration_ms, source, updated_at_ms)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(anime_id, episode) DO NOTHING`
	// setManualSQL overwrites value and source, skipping an identical row so
	// a no-op save changes nothing and marks nothing.
	setManualSQL = `
		INSERT INTO anime_episode_durations (anime_id, episode, duration_ms, source, updated_at_ms)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(anime_id, episode) DO UPDATE SET
			duration_ms = excluded.duration_ms, source = excluded.source, updated_at_ms = excluded.updated_at_ms
		WHERE duration_ms <> excluded.duration_ms OR source <> excluded.source`
	// confirmMeasuredSQL updates only measured rows whose value differs;
	// manual rows are never overwritten by a re-analysis.
	confirmMeasuredSQL = `
		INSERT INTO anime_episode_durations (anime_id, episode, duration_ms, source, updated_at_ms)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(anime_id, episode) DO UPDATE SET
			duration_ms = excluded.duration_ms, updated_at_ms = excluded.updated_at_ms
		WHERE source = excluded.source AND duration_ms <> excluded.duration_ms`
	clearSQL = `DELETE FROM anime_episode_durations WHERE anime_id = ? AND episode = ?`
	// markPendingSQL renews an existing mark to a strictly greater value, so
	// ClearPending of a mark read before the renewal never drops it.
	markPendingSQL = `
		INSERT INTO durations_pending_announce (anime_id, marked_at_ms)
		VALUES (?, ?)
		ON CONFLICT(anime_id) DO UPDATE SET marked_at_ms = MAX(excluded.marked_at_ms, marked_at_ms + 1)`
)

// FillGaps stores measured readings only for episodes with no row yet, so an
// automatic measurement never overwrites a value (analysis D3). It returns
// how many rows were inserted.
func (s *Store) FillGaps(ctx context.Context, animeID string, readings []Reading) (int, error) {
	return s.upsertReadings(ctx, fillGapSQL, SourceMeasured, animeID, readings)
}

// SetManual stores the user's duration for one episode with source manual,
// replacing any value it had.
func (s *Store) SetManual(ctx context.Context, animeID string, episode int, durationMS int64) error {
	_, err := s.upsertReadings(ctx, setManualSQL, SourceManual, animeID, []Reading{{Episode: episode, DurationMS: durationMS}})
	return err
}

// ConfirmMeasured stores a confirmed re-analysis: each reading inserts a
// missing episode or updates a measured one, and never touches a manual row.
// It returns how many rows changed.
func (s *Store) ConfirmMeasured(ctx context.Context, animeID string, readings []Reading) (int, error) {
	return s.upsertReadings(ctx, confirmMeasuredSQL, SourceMeasured, animeID, readings)
}

// Clear deletes one episode's duration ("Clear duration").
func (s *Store) Clear(ctx context.Context, animeID string, episode int) error {
	if err := validateTarget(animeID, episode); err != nil {
		return err
	}
	_, err := s.write(ctx, animeID, func(tx *sql.Tx, _ int64, changed *int64) error {
		return execAffected(ctx, tx, changed, clearSQL, animeID, episode)
	})
	return err
}

// upsertReadings validates every reading before writing any, then runs
// query once per reading in one transaction and returns the rows changed.
func (s *Store) upsertReadings(ctx context.Context, query, source, animeID string, readings []Reading) (int, error) {
	for _, r := range readings {
		if err := validateTarget(animeID, r.Episode); err != nil {
			return 0, err
		}
		if r.DurationMS <= 0 {
			return 0, fmt.Errorf("%w: episode %d has %d ms", ErrInvalidDuration, r.Episode, r.DurationMS)
		}
	}
	return s.write(ctx, animeID, func(tx *sql.Tx, nowMS int64, changed *int64) error {
		for _, r := range readings {
			if err := execAffected(ctx, tx, changed, query, animeID, r.Episode, r.DurationMS, source, nowMS); err != nil {
				return err
			}
		}
		return nil
	})
}

// write runs apply in one transaction, letting it add the rows it changes to
// a shared count, and, when that count is above zero, marks animeID pending
// in that same transaction. apply reports failure only through its error, so
// no partial count can escape a failed write.
func (s *Store) write(ctx context.Context, animeID string, apply func(*sql.Tx, int64, *int64) error) (int, error) {
	nowMS := s.now().UnixMilli()
	var n int64
	err := persistence.InTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := apply(tx, nowMS, &n); err != nil {
			return err
		}
		if n == 0 {
			return nil
		}
		if _, err := tx.ExecContext(ctx, markPendingSQL, animeID, nowMS); err != nil {
			return fmt.Errorf("mark anime %q pending announce: %w", animeID, err)
		}
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("episode duration write for %q: %w", animeID, err)
	}
	return int(n), nil
}

// execAffected runs one statement on tx and adds the rows it changed to
// changed.
func execAffected(ctx context.Context, tx *sql.Tx, changed *int64, query string, args ...any) error {
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("write episode duration: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read episode duration write result: %w", err)
	}
	*changed += n
	return nil
}

// validateTarget checks the anime id and episode every write addresses.
func validateTarget(animeID string, episode int) error {
	if strings.TrimSpace(animeID) == "" {
		return ErrEmptyAnimeID
	}
	if episode < 1 {
		return fmt.Errorf("%w: got %d", ErrInvalidEpisode, episode)
	}
	return nil
}
