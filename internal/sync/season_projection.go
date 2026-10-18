package sync

import (
	"context"
	"database/sql"
	"fmt"
	"slices"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/persistence"
)

// changedFieldSeason is the changed field of the changelog row a season projection change records:
// the anime itself did not change, only the season candidacy served inside it.
const changedFieldSeason = "season"

// seasonProjectionPublishedDDL stores, per anime, the season projection the changelog last
// announced. It is what the next publication diffs against, so it holds only candidates: an anime
// that is not a candidate has no row.
const seasonProjectionPublishedDDL = `
	CREATE TABLE IF NOT EXISTS season_projection_published (
		anime_id TEXT PRIMARY KEY,
		season_id TEXT NOT NULL,
		grade INTEGER
	)`

// SeasonCandidacy is one anime's projection in the open active season. Grade is nil while the
// anime is not graded.
type SeasonCandidacy struct {
	AnimeID  string
	SeasonID string
	Grade    *int
}

// SeasonProjectionSource reads every candidacy of the open season; it returns none when no season
// is open.
type SeasonProjectionSource func(context.Context) ([]SeasonCandidacy, error)

// SeasonProjectionPublisherConfig wires a SeasonProjectionPublisher. OnPublished and Log are
// optional.
type SeasonProjectionPublisherConfig struct {
	Provider    SQLiteProvider
	Source      SeasonProjectionSource
	Now         func() time.Time
	OnPublished func(ctx context.Context, animeIDs []string)
	Log         sharedlogger.Logger
}

// SeasonProjectionPublisher records one changelog row for every anime whose season projection
// changed since the last publication, so the reconcile cursor delivers season candidacy like any
// other anime change.
type SeasonProjectionPublisher struct {
	config SeasonProjectionPublisherConfig

	// mu serializes publications: each one reads the projection and then diffs it in a
	// transaction, and two interleaved runs could store an older read over a newer one.
	mu           sync.Mutex
	unsubscribes []func()
}

// NewSeasonProjectionPublisher builds the publisher.
func NewSeasonProjectionPublisher(config SeasonProjectionPublisherConfig) *SeasonProjectionPublisher {
	if config.Now == nil {
		config.Now = time.Now
	}
	return &SeasonProjectionPublisher{config: config}
}

// Start publishes once, which backfills every candidate on the first run after an upgrade and
// repairs a publication a crash interrupted, then publishes on every season projection signal.
func (p *SeasonProjectionPublisher) Start(ctx context.Context, bus events.Bus) {
	p.publishAndNotify(ctx)
	p.unsubscribes = append(p.unsubscribes, bus.Subscribe(events.EventNameSeasonProjectionChanged, func(events.Event) {
		p.publishAndNotify(ctx)
	}))
}

// Stop unsubscribes the publisher from the event bus.
func (p *SeasonProjectionPublisher) Stop() {
	for _, unsubscribe := range p.unsubscribes {
		unsubscribe()
	}
	p.unsubscribes = nil
}

// publishAndNotify publishes and hands the anime that got a row to OnPublished, logging a failure:
// the next signal or start retries it.
func (p *SeasonProjectionPublisher) publishAndNotify(ctx context.Context) {
	published, err := p.Publish(ctx)
	if err != nil {
		if p.config.Log != nil {
			p.config.Log.Logf("sync", sharedlogger.LevelError, sharedlogger.Fields{EventType: "sync.season_projection"},
				"failed to publish season projection: %v", err)
		}
		return
	}
	if len(published) > 0 && p.config.OnPublished != nil {
		p.config.OnPublished(ctx, published)
	}
}

// Publish diffs the current projection against the published one and, in one transaction, records
// a ["season"] row for every changed anime and stores the new projection. A row carries the
// anime's current stored snapshot, so its modified_at is untouched. It returns the anime that got
// a row; an anime that no longer exists gets none but is still marked published.
func (p *SeasonProjectionPublisher) Publish(ctx context.Context) ([]string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	candidacies, err := p.config.Source(ctx)
	if err != nil {
		return nil, fmt.Errorf("read season projection: %w", err)
	}
	current := make(map[string]SeasonCandidacy, len(candidacies))
	for _, candidacy := range candidacies {
		current[candidacy.AnimeID] = candidacy
	}
	nowMs := p.config.Now().UnixMilli()
	var published []string
	err = persistence.InTx(ctx, p.config.Provider.DB(), func(tx *sql.Tx) (err error) {
		published, err = publishChangedCandidacies(ctx, tx, current, nowMs)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("publish season projection: %w", err)
	}
	return published, nil
}

// publishChangedCandidacies records and stores, inside tx, every candidacy that differs from the
// published projection, and returns the anime that got a row.
func publishChangedCandidacies(ctx context.Context, tx *sql.Tx, current map[string]SeasonCandidacy, nowMs int64) ([]string, error) {
	previous, err := loadPublishedProjection(ctx, tx)
	if err != nil {
		return nil, err
	}
	var published []string
	for _, animeID := range changedAnimeIDs(previous, current) {
		stored, err := recordSeasonRow(ctx, tx, animeID, nowMs)
		if err != nil {
			return nil, err
		}
		if stored {
			published = append(published, animeID)
		}
		if err := storePublishedCandidacy(ctx, tx, animeID, current); err != nil {
			return nil, err
		}
	}
	return published, nil
}

// changedAnimeIDs returns, sorted, every anime whose candidacy differs between previous and current.
func changedAnimeIDs(previous, current map[string]SeasonCandidacy) []string {
	var changed []string
	for animeID, candidacy := range current {
		if before, ok := previous[animeID]; !ok || !sameCandidacy(before, candidacy) {
			changed = append(changed, animeID)
		}
	}
	for animeID := range previous {
		if _, ok := current[animeID]; !ok {
			changed = append(changed, animeID)
		}
	}
	slices.Sort(changed)
	return changed
}

// sameCandidacy reports whether a and b project the same season and grade.
func sameCandidacy(a, b SeasonCandidacy) bool {
	if a.SeasonID != b.SeasonID || (a.Grade == nil) != (b.Grade == nil) {
		return false
	}
	return a.Grade == nil || *a.Grade == *b.Grade
}

// recordSeasonRow stores one ["season"] row of animeID inside tx and reports whether it was stored:
// the changelog keeps no row of an anime that no longer exists.
func recordSeasonRow(ctx context.Context, tx *sql.Tx, animeID string, nowMs int64) (bool, error) {
	if _, found, err := currentAnimeSnapshot(ctx, tx, animeID); err != nil || !found {
		return false, err
	}
	err := insertPendingTx(ctx, tx, normalizePendingChangelogEntry(ChangelogEntry{
		AnimeID:       animeID,
		ChangedFields: []string{changedFieldSeason},
		ChangedAtMs:   nowMs,
	}))
	return err == nil, err
}

// loadPublishedProjection reads the published projection inside tx.
func loadPublishedProjection(ctx context.Context, tx *sql.Tx) (published map[string]SeasonCandidacy, err error) {
	rows, err := tx.QueryContext(ctx, `SELECT anime_id, season_id, grade FROM season_projection_published`)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); err == nil {
			err = closeErr
		}
	}()
	published = map[string]SeasonCandidacy{}
	for rows.Next() {
		var candidacy SeasonCandidacy
		var grade sql.NullInt64
		if err := rows.Scan(&candidacy.AnimeID, &candidacy.SeasonID, &grade); err != nil {
			return nil, err
		}
		if grade.Valid {
			value := int(grade.Int64)
			candidacy.Grade = &value
		}
		published[candidacy.AnimeID] = candidacy
	}
	return published, rows.Err()
}

// storePublishedCandidacy stores animeID's current candidacy inside tx, or removes it when the
// anime is no longer a candidate.
func storePublishedCandidacy(ctx context.Context, tx *sql.Tx, animeID string, current map[string]SeasonCandidacy) error {
	candidacy, ok := current[animeID]
	if !ok {
		_, err := tx.ExecContext(ctx, `DELETE FROM season_projection_published WHERE anime_id = ?`, animeID)
		return err
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO season_projection_published (anime_id, season_id, grade) VALUES (?, ?, ?)
		ON CONFLICT(anime_id) DO UPDATE SET season_id = excluded.season_id, grade = excluded.grade
	`, animeID, candidacy.SeasonID, candidacy.Grade)
	return err
}
