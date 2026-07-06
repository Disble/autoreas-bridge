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

// AvailabilityProbe reports whether an anime page has its first chapter online
// yet. Implemented at the composition root over the download sites registry.
type AvailabilityProbe interface {
	HasChapterOne(ctx context.Context, pageURL string) (bool, error)
}

// AnimeCreateInput is the season-side projection of what a new anime needs; the
// AnimeGateway maps it to the anime context's create contract and computes the
// next free orden within Section (an anime-side concern).
type AnimeCreateInput struct {
	Nombre  string
	Pagina  string
	Section string
}

// AnimeGateway is the narrow port into the anime context: it creates an anime
// (landing it in the given Estrenos section) and finds an existing ACTIVE anime
// by its page URL (two-cour continuations link instead of creating). The season
// context never touches anime rows directly.
type AnimeGateway interface {
	CreateAnime(ctx context.Context, in AnimeCreateInput) (animeID string, err error)
	FindActiveByPagina(ctx context.Context, pageURL string) (animeID string, found bool, err error)
	// MoveToSection moves an anime to a single Estrenos section (Sin ver / Ver
	// hoy / Visto). Used by the watched-in-Ver-hoy auto-transition.
	MoveToSection(ctx context.Context, animeID, section string) error
}
