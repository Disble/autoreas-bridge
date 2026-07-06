package season

import (
	"context"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// Repository is the season persistence port. ActiveSeason returns the single
// open season, or (nil, nil) when none is open.
type Repository interface {
	CreateSeason(ctx context.Context, s domain.Season) error
	ActiveSeason(ctx context.Context) (*domain.Season, error)
	UpdateSeason(ctx context.Context, s domain.Season) error

	CreateSeasonAnime(ctx context.Context, sa domain.SeasonAnime) error
	ListSeasonAnimes(ctx context.Context, seasonID string) ([]domain.SeasonAnime, error)
	SeasonAnimeByID(ctx context.Context, id string) (*domain.SeasonAnime, error)
	UpdateSeasonAnime(ctx context.Context, sa domain.SeasonAnime) error
}

// NameSearcher looks up candidate anime pages for a raw intake name against a
// verified source (jkanime). Implemented at the composition root over the
// jkanime search adapter so the season context stays decoupled from download.
type NameSearcher interface {
	Search(ctx context.Context, query string) ([]match.Candidate, error)
}
