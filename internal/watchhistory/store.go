package watchhistory

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync/atomic"
)

const (
	insertWatchHistorySQL = `
		INSERT INTO watch_history (anime_id, anime_name, episode, cycle, watched_at_ms, source, source_activity_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(anime_id, cycle, episode) DO NOTHING`
	retractWatchHistorySQL = `
		DELETE FROM watch_history WHERE anime_id = ? AND cycle = ? AND episode > ?`
)

// Store persists watch_history rows and serves keyset-paged reads.
type Store struct {
	db *sql.DB
	// conflicts counts every ON CONFLICT DO NOTHING no-op insert (design.md
	// line 607: "the store counts conflicts"). atomic.Int64 because one
	// Store is shared by the desktop write path and the mobile HTTP write
	// path concurrently.
	conflicts atomic.Int64
}

// NewStore builds a SQLite-backed watch-history store.
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Conflicts returns the number of conflicting inserts observed so far. On a
// live write a conflict is unreachable by the natural-key argument
// (design.md's Interfaces / Contracts), so any non-zero count means a
// retraction failed to remove a row it should have.
func (s *Store) Conflicts() int64 {
	return s.conflicts.Load()
}

// ApplyTx derives change's effect and applies it within the caller's
// transaction (the primitive both Apply and the one-shot backfill build
// on). A conflicting insert is a no-op -- on a live write it is
// unreachable by the natural-key argument (design.md's Interfaces /
// Contracts), so one occurring means a retraction silently failed to run;
// it is warn-logged rather than silently swallowed.
func (s *Store) ApplyTx(ctx context.Context, tx *sql.Tx, change Change) error {
	switch effect := Derive(change); effect.Kind {
	case EffectRecord:
		return s.insertEpisodes(ctx, tx, change, effect)
	case EffectRetract:
		if _, err := tx.ExecContext(ctx, retractWatchHistorySQL, change.AnimeID, change.Cycle, effect.Floor); err != nil {
			return fmt.Errorf("retract watch_history rows: %w", err)
		}
		return nil
	default:
		return nil
	}
}

// Apply derives and applies change inside a store-owned transaction.
func (s *Store) Apply(ctx context.Context, change Change) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin watch_history tx: %w", err)
	}
	if err := s.ApplyTx(ctx, tx, change); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// insertEpisodes inserts one row per newly reached episode. Every episode
// carries the instant the bridge observed the change, except the highest one,
// which carries the effect's landing instant -- the source's reported watch
// time when it is usable, otherwise the same observation instant
// (design.md D1/D3).
func (s *Store) insertEpisodes(ctx context.Context, tx *sql.Tx, change Change, effect Effect) error {
	for i, episode := range effect.Episodes {
		occurredAtMS := change.OccurredAtMS
		if i == len(effect.Episodes)-1 {
			occurredAtMS = effect.LandingAtMS
		}
		result, err := tx.ExecContext(ctx, insertWatchHistorySQL,
			change.AnimeID, change.AnimeName, episode, change.Cycle, occurredAtMS, change.Source, change.SourceActivityID)
		if err != nil {
			return fmt.Errorf("insert watch_history row: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read watch_history insert result: %w", err)
		}
		if affected == 0 {
			s.conflicts.Add(1)
			log.Printf("watchhistory: conflicting insert no-op anime_id=%s cycle=%d episode=%d", change.AnimeID, change.Cycle, episode)
		}
	}
	return nil
}
