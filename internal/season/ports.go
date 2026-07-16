package season

import (
	"context"
	"errors"
	"fmt"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

type AnimeMutationOutcome string

const (
	AnimeMutationApplied  AnimeMutationOutcome = "applied"
	AnimeMutationNoOp     AnimeMutationOutcome = "no_op"
	AnimeMutationConflict AnimeMutationOutcome = "conflict"
)

type AnimeMutationResult struct {
	AnimeID    string
	Outcome    AnimeMutationOutcome
	ModifiedAt int64
	ConflictID string
}

var ErrAnimeMutationConflict = errors.New("anime mutation conflict")

func acceptAnimeMutation(result AnimeMutationResult) error {
	switch result.Outcome {
	case AnimeMutationApplied, AnimeMutationNoOp:
		return nil
	case AnimeMutationConflict:
		return fmt.Errorf("%w: anime=%s modifiedAt=%d conflictId=%s", ErrAnimeMutationConflict, result.AnimeID, result.ModifiedAt, result.ConflictID)
	default:
		return fmt.Errorf("unexpected anime mutation outcome %q", result.Outcome)
	}
}

// Repository is the season persistence port. ActiveSeason returns the single
// open season, or (nil, nil) when none is open.
type Repository interface {
	CreateSeason(ctx context.Context, s domain.Season) error
	ActiveSeason(ctx context.Context) (*domain.Season, error)
	UpdateSeason(ctx context.Context, s domain.Season) error
	// ListSeasons returns every season (open + closed), newest first, for the
	// past-seasons history view.
	ListSeasons(ctx context.Context) ([]domain.Season, error)
	// SeasonByID returns a single season by id, or (nil, nil) when absent.
	SeasonByID(ctx context.Context, id string) (*domain.Season, error)

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

// AvailabilityProbe reports how many chapters of an anime page are online yet (0
// = none available). Implemented at the composition root over the download sites
// registry. It only READS availability — creation is a separate, explicit action.
type AvailabilityProbe interface {
	AvailableChapters(ctx context.Context, pageURL string) (int, error)
}

// AnimeCreateInput is the season-side projection of what a new anime needs; the
// AnimeGateway maps it to the anime context's create contract and computes the
// next free orden within Section (an anime-side concern).
type AnimeCreateInput struct {
	Nombre  string
	Pagina  string
	Section string
	// Carpeta is the absolute download folder for the new anime. Empty means the
	// record is created without a carpeta (downloads skip it until one is set).
	Carpeta string
	// Tipo is the legacy content type (0 = Serie / Anime TV, 1 = Pelicula, 2 = OVA).
	// Nil omits the field, which is why season creation always sets a default.
	Tipo *int
}

// AnimeGateway is the narrow port into the anime context: it creates an anime
// (landing it in the given Estrenos section) and finds an existing ACTIVE anime
// by its page URL (two-cour continuations link instead of creating). The season
// context never touches anime rows directly.
type AnimeGateway interface {
	CreateAnime(ctx context.Context, in AnimeCreateInput) (AnimeMutationResult, error)
	FindActiveByPagina(ctx context.Context, pageURL string) (animeID string, found bool, err error)
	// MoveToSection moves an anime to a single Estrenos section (Sin ver / Ver
	// hoy / Visto). Used by the watched-in-Ver-hoy auto-transition.
	MoveToSection(ctx context.Context, animeID, section string) (AnimeMutationResult, error)
	// SetSelection applies a confirmed selection verdict to the anime: its estado
	// (0 Viendo / 2 No me gusto) and activo flag. Soft delete only. Used by
	// ConfirmSelection's bidirectional reconciler.
	SetSelection(ctx context.Context, animeID string, estado int, activo bool) (AnimeMutationResult, error)
	// CurrentPlacements returns the current dias placements ({dia, orden}) of the
	// given animes, for diffing against the ordering draft (SDD-46).
	CurrentPlacements(ctx context.Context, animeIDs []string) (map[string][]domain.Placement, error)
	// SetAnimeSchedule writes the anime's dias with explicit {dia, orden} — the
	// weekday-scheduling apply. Soft state only.
	SetAnimeSchedule(ctx context.Context, animeID string, dias []domain.Placement) (AnimeMutationResult, error)
}
