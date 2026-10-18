package season

import (
	"context"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season/domain"
)

// projectionSignalRepository publishes events.SeasonProjectionChangedEvent after every successful
// season write. Signalling at the repository, not in each service method, means no write path
// (bindings, ratings, the availability recheck, the anime-watched transition) can forget it.
type projectionSignalRepository struct {
	Repository
	bus events.Bus
}

// WithProjectionSignal decorates repo so every successful write signals that the season projection
// may have changed. A nil bus returns repo unchanged.
func WithProjectionSignal(repo Repository, bus events.Bus) Repository {
	if bus == nil {
		return repo
	}
	return projectionSignalRepository{Repository: repo, bus: bus}
}

// CreateSeason creates the season and signals.
func (r projectionSignalRepository) CreateSeason(ctx context.Context, s domain.Season) error {
	return r.signalAfter(r.Repository.CreateSeason(ctx, s))
}

// UpdateSeason updates the season and signals.
func (r projectionSignalRepository) UpdateSeason(ctx context.Context, s domain.Season) error {
	return r.signalAfter(r.Repository.UpdateSeason(ctx, s))
}

// CreateSeasonAnime creates the season anime and signals.
func (r projectionSignalRepository) CreateSeasonAnime(ctx context.Context, sa domain.SeasonAnime) error {
	return r.signalAfter(r.Repository.CreateSeasonAnime(ctx, sa))
}

// UpdateSeasonAnime updates the season anime and signals.
func (r projectionSignalRepository) UpdateSeasonAnime(ctx context.Context, sa domain.SeasonAnime) error {
	return r.signalAfter(r.Repository.UpdateSeasonAnime(ctx, sa))
}

// signalAfter signals when the write it follows succeeded, and returns that write's error.
func (r projectionSignalRepository) signalAfter(err error) error {
	if err == nil {
		r.bus.Publish(events.SeasonProjectionChangedEvent{})
	}
	return err
}
