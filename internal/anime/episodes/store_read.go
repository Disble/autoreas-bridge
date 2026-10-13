package episodes

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const (
	selectDurationColumns = `SELECT anime_id, episode, duration_ms, source, updated_at_ms FROM anime_episode_durations`
	clearPendingSQL       = `DELETE FROM durations_pending_announce WHERE anime_id = ? AND marked_at_ms = ?`
)

// ByAnime returns one anime's durations ordered by episode.
func (s *Store) ByAnime(ctx context.Context, animeID string) ([]Duration, error) {
	rows, err := s.db.QueryContext(ctx, selectDurationColumns+` WHERE anime_id = ? ORDER BY episode`, animeID)
	if err != nil {
		return nil, fmt.Errorf("query episode durations of %q: %w", animeID, err)
	}
	return scanDurations(rows)
}

// ByAnimeIDs returns the durations of every listed anime in one query, keyed
// by anime id and ordered by episode. Anime with no rows are absent.
func (s *Store) ByAnimeIDs(ctx context.Context, animeIDs []string) (map[string][]Duration, error) {
	byAnime := make(map[string][]Duration, len(animeIDs))
	if len(animeIDs) == 0 {
		return byAnime, nil
	}
	args := make([]any, len(animeIDs))
	for i, id := range animeIDs {
		args[i] = id
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(animeIDs)), ",")
	rows, err := s.db.QueryContext(ctx,
		selectDurationColumns+` WHERE anime_id IN (`+placeholders+`) ORDER BY anime_id, episode`, args...)
	if err != nil {
		return nil, fmt.Errorf("query episode durations of %d anime: %w", len(animeIDs), err)
	}
	durations, err := scanDurations(rows)
	if err != nil {
		return nil, err
	}
	for _, d := range durations {
		byAnime[d.AnimeID] = append(byAnime[d.AnimeID], d)
	}
	return byAnime, nil
}

// PendingAnnounce returns every anime waiting to be announced, oldest first.
func (s *Store) PendingAnnounce(ctx context.Context) ([]Pending, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT anime_id, marked_at_ms FROM durations_pending_announce ORDER BY marked_at_ms, anime_id`)
	if err != nil {
		return nil, fmt.Errorf("query pending duration announcements: %w", err)
	}
	// Read-only query: rows.Err() below covers iteration failures.
	defer func() { _ = rows.Close() }()

	var pending []Pending
	for rows.Next() {
		var p Pending
		if err := rows.Scan(&p.AnimeID, &p.MarkedAtMS); err != nil {
			return nil, fmt.Errorf("scan pending duration announcement: %w", err)
		}
		pending = append(pending, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending duration announcements: %w", err)
	}
	return pending, nil
}

// ClearPending removes p's mark unless a later write re-marked the anime.
func (s *Store) ClearPending(ctx context.Context, p Pending) error {
	if _, err := s.db.ExecContext(ctx, clearPendingSQL, p.AnimeID, p.MarkedAtMS); err != nil {
		return fmt.Errorf("clear pending duration announcement of %q: %w", p.AnimeID, err)
	}
	return nil
}

// scanDurations reads and closes rows selected with selectDurationColumns.
func scanDurations(rows *sql.Rows) ([]Duration, error) {
	// Read-only query: rows.Err() below covers iteration failures.
	defer func() { _ = rows.Close() }()

	var durations []Duration
	for rows.Next() {
		var d Duration
		if err := rows.Scan(&d.AnimeID, &d.Episode, &d.DurationMS, &d.Source, &d.UpdatedAtMS); err != nil {
			return nil, fmt.Errorf("scan episode duration: %w", err)
		}
		durations = append(durations, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate episode durations: %w", err)
	}
	return durations, nil
}
