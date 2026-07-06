package season

import (
	"context"

	"autoreas-bridge/internal/season/domain"
)

// Repository is the season persistence port. ActiveSeason returns the single
// open season, or (nil, nil) when none is open. Later slices extend this port
// with season_anime operations.
type Repository interface {
	CreateSeason(ctx context.Context, s domain.Season) error
	ActiveSeason(ctx context.Context) (*domain.Season, error)
	UpdateSeason(ctx context.Context, s domain.Season) error
}
