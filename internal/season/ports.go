package season

import (
	"context"
	"errors"
	"fmt"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// AnimeMutationOutcome classifies the result of an anime-side mutation.
type AnimeMutationOutcome string

const (
	// AnimeMutationApplied means the mutation changed persisted state.
	AnimeMutationApplied AnimeMutationOutcome = "applied"
	// AnimeMutationNoOp means the mutation was accepted but produced no data change.
	AnimeMutationNoOp AnimeMutationOutcome = "no_op"
	// AnimeMutationConflict means the mutation lost an optimistic-concurrency check.
	AnimeMutationConflict AnimeMutationOutcome = "conflict"
)

// AnimeMutationResult returns the outcome metadata of an anime-side mutation.
type AnimeMutationResult struct {
	AnimeID    string
	Outcome    AnimeMutationOutcome
	ModifiedAt int64
	ConflictID string
}

// ErrAnimeMutationConflict reports an optimistic-concurrency conflict.
var ErrAnimeMutationConflict = errors.New("anime mutation conflict")

// acceptAnimeMutation converts a mutation result into its accepted error state.
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

// AvailabilityReader reports how many episodes of an anime page are online yet (0
// = none available). Implemented at the composition root over the download sites
// registry. It only READS availability — creation is a separate, explicit action.
type AvailabilityReader interface {
	AvailableEpisodes(ctx context.Context, pageURL string) (int, error)
}

// AnimeCreateCover is the canonical typed anime cover ({type, path}) the anime
// create contract uses. A confirmed intake cover travels as this shape instead of
// a bare URL, so the season gateway forwards the cover's type as-is rather than
// synthesizing one of its own.
type AnimeCreateCover struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

// AnimeCreateMetadata is the optional, user-confirmed MyAnimeList metadata one
// intake row may carry into the anime it creates. Every member is optional: a
// nil pointer, an empty string or an empty list means "the user confirmed
// nothing here", and the created anime keeps exactly the value it would have
// had without any metadata at all.
//
// The field names and the cover's typed {type, path} shape are the canonical
// anime create vocabulary — the same keys
// internal/anime/store.NewCanonicalCreate writes — so a value confirmed here
// lands in the created anime unchanged. internal/desktop/app_season_test.go pins
// that parity, because this package must not import internal/anime.
//
// There is deliberately no title member: the anime's name is its identity, not
// metadata. The intake row's raw name — what the user typed — is what the anime
// is created with, so a confirmed MyAnimeList title must never rename it.
type AnimeCreateMetadata struct {
	// Kind is the canonical content type (0 = Anime (TV), 1 = Película, 2 = Especial, 3 = OVA).
	Kind *int `json:"kind,omitempty"`
	// TotalEpisodes is the announced episode count.
	TotalEpisodes *int `json:"totalEpisodes,omitempty"`
	// DurationMinutes is one episode's duration in minutes.
	DurationMinutes *int `json:"durationMinutes,omitempty"`
	// Origin is the source work's origin label (manga, novel, original, ...).
	Origin string `json:"origin,omitempty"`
	// Genres and Studios are the confirmed lists; nil means none were confirmed.
	Genres  []string `json:"genres,omitempty"`
	Studios []string `json:"studios,omitempty"`
	// Cover is the confirmed cover in the canonical typed shape; nil means none
	// was confirmed.
	Cover *AnimeCreateCover `json:"cover,omitempty"`
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
	// Tipo is the canonical content type (0 = Anime (TV), 1 = Película, 2 = Especial,
	// 3 = OVA). Nil omits the field, which is why season creation always sets a default.
	Tipo *int
	// Metadata is the optional, user-confirmed MyAnimeList metadata for this row.
	// Nil (or an all-empty value) creates exactly the anime this input describes
	// without metadata.
	Metadata *AnimeCreateMetadata
}

// AnimeGateway is the narrow port into the anime context: it creates an anime
// (landing it in the given Estrenos section) and finds an existing ACTIVE anime
// by its page URL (two-cour continuations link instead of creating). The season
// context never touches anime rows directly.
type AnimeGateway interface {
	CreateAnime(ctx context.Context, in AnimeCreateInput) (AnimeMutationResult, error)
	FindActiveByPagina(ctx context.Context, pageURL string) (animeID string, found bool, err error)
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
