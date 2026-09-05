package anime

import (
	"context"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/api/contracts"
)

const (
	// ActivitySourceDesktop marks a desktop-initiated episode action.
	ActivitySourceDesktop = "desktop"
	// ActivitySourceMobile marks a mobile-initiated episode action.
	ActivitySourceMobile = "mobile"
	// ActivitySourceSystem marks a system-initiated episode action.
	ActivitySourceSystem = "system"
	// ActivitySourceLegacy marks a legacy-observed episode action.
	ActivitySourceLegacy = "legacy"
	// ActivityActionAnimeStateSet marks an explicit anime state mutation.
	ActivityActionAnimeStateSet = "anime_state_set"
	// ActivityActionAnimeSoftDeleted marks an anime deactivation mutation.
	ActivityActionAnimeSoftDeleted = "anime_soft_deleted"
	// ActivityActionAnimeRestored marks an anime restore mutation.
	ActivityActionAnimeRestored = "anime_restored"
	// ActivityActionAnimeRepeated marks an anime repeat mutation.
	ActivityActionAnimeRepeated = "anime_repeated"
	// ActivityActionAnimePageOpened marks a page-open desktop action.
	ActivityActionAnimePageOpened = "anime_page_opened"
	// ActivityActionAnimePageCopied marks a page-copy desktop action.
	ActivityActionAnimePageCopied = "anime_page_copied"
	// ActivityActionAnimeFolderOpened marks a folder-open desktop action.
	ActivityActionAnimeFolderOpened = "anime_folder_opened"
	// ActivityActionAnimeFolderCopied marks a folder-copy desktop action.
	ActivityActionAnimeFolderCopied = "anime_folder_copied"
	defaultActivityCorrelationType  = "anime.episode"
)

var (
	// ErrInvalidEpisodeDelta reports an episode delta outside the supported increments.
	ErrInvalidEpisodeDelta = errors.New("invalid episode delta")
	// ErrEpisodeProgressBlocked reports episode progress blocked by the current anime state.
	ErrEpisodeProgressBlocked = errors.New("episode progress is blocked by anime state")
	// ErrEpisodeProgressBelowZero reports an episode decrement below zero progress.
	ErrEpisodeProgressBelowZero = errors.New("episode progress cannot go below zero")
)

// EpisodeQuery loads the read models required by episode mutations.
type EpisodeQuery interface {
	GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error)
	ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error)
}

// EpisodeWriter applies episode-related anime patches.
type EpisodeWriter interface {
	PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) (contracts.AnimePatchResult, error)
}

// ActivityRecorder persists user-visible anime activity entries.
type ActivityRecorder interface {
	RecordActivity(ctx context.Context, record ActivityRecord) error
}

// EpisodeServiceDeps wires the ports required by EpisodeService.
type EpisodeServiceDeps struct {
	Query    EpisodeQuery
	Writer   EpisodeWriter
	Activity ActivityRecorder
	Now      func() time.Time
}

// EpisodeScheduleQuery filters episode schedule items by day/section.
type EpisodeScheduleQuery struct {
	Day string
}

// EpisodeScheduleItem is the read model returned by ListEpisodeSchedule.
type EpisodeScheduleItem struct {
	AnimeID      string
	AnimeName    string
	Estado       int
	NroCapVisto  float64
	TotalCap     *int
	Day          string
	DayOrder     int
	ModifiedAt   int64
	FolderPath   string
	PageURL      string
	HasCover     bool
	LastWatched  *int64
	FirstWatched *int64
}

// EpisodeService owns episode progress and related lifecycle mutations.
type EpisodeService struct {
	query    EpisodeQuery
	writer   EpisodeWriter
	activity ActivityRecorder
	now      func() time.Time
}

// AdjustWatchedEpisodesCommand increments or decrements watched progress.
type AdjustWatchedEpisodesCommand struct {
	AnimeID string
	Delta   float64
	Base    *int64
	Source  string
}

// SetAnimeStateCommand sets the anime estado field directly.
type SetAnimeStateCommand struct {
	AnimeID string
	Estado  int
	Base    *int64
	Source  string
}

// SetAnimeDaysCommand moves an anime to a new set of days/sections (SDD-43): the
// season workflow uses it to stage animes across the Estrenos sections
// (Sin ver / Ver hoy / Visto). Dias replaces the whole dias[] array; orden is
// assigned by position.
type SetAnimeDaysCommand struct {
	AnimeID string
	Dias    []string
	Base    *int64
}

// SoftDeleteAnimeCommand deactivates one anime without tombstoning it.
type SoftDeleteAnimeCommand struct {
	AnimeID string
	Base    *int64
	Source  string
}

// RestoreAnimeCommand reactivates one previously deactivated anime.
type RestoreAnimeCommand struct {
	AnimeID string
	Base    *int64
	Source  string
}

// RepeatAnimeCommand marks one anime for repeat playback.
type RepeatAnimeCommand struct {
	AnimeID string
	Base    *int64
	Source  string
}

// EpisodeCommandResult returns the semantic outcome of one episode mutation.
type EpisodeCommandResult struct {
	AnimeID       string
	Outcome       PatchOutcome
	ModifiedAt    int64
	ConflictID    string
	AnimeName     string
	Estado        int
	NroCapVisto   float64
	OccurredAtMs  int64
	CorrelationID string
}

// ActivityRecord captures one persisted anime activity entry.
type ActivityRecord struct {
	Source        string
	ActionType    string
	AnimeID       string
	AnimeName     string
	OccurredAtMs  int64
	CorrelationID string
	Before        ActivityAnimeSnapshot
	After         ActivityAnimeSnapshot
}

// ActivityAnimeSnapshot captures the anime state before or after one activity.
type ActivityAnimeSnapshot struct {
	Estado      int
	NroCapVisto float64
	Activo      int
}

// NewEpisodeService builds an EpisodeService with default clock behavior.
func NewEpisodeService(deps EpisodeServiceDeps) *EpisodeService {
	now := deps.Now
	if now == nil {
		now = time.Now
	}
	return &EpisodeService{
		query:    deps.Query,
		writer:   deps.Writer,
		activity: deps.Activity,
		now:      now,
	}
}

// AdjustWatchedEpisodes updates watched progress using the supported +/- 1 and +/- 0.5 steps.
func (s *EpisodeService) AdjustWatchedEpisodes(ctx context.Context, cmd AdjustWatchedEpisodesCommand) (EpisodeCommandResult, error) {
	if !isAllowedEpisodeDelta(cmd.Delta) {
		return EpisodeCommandResult{}, ErrInvalidEpisodeDelta
	}

	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return EpisodeCommandResult{}, err
	}
	if current.Status > 0 {
		return EpisodeCommandResult{}, ErrEpisodeProgressBlocked
	}

	nextProgress := current.EpisodesWatched + cmd.Delta
	if nextProgress < 0 {
		return EpisodeCommandResult{}, ErrEpisodeProgressBelowZero
	}

	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, buildEpisodeProgressPatch(current, nextProgress, occurredAtMs, cmd.Base))
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	source := defaultActivitySource(cmd.Source)
	correlationID := activityCorrelationID(cmd.AnimeID, occurredAtMs)
	adjustment := episodeAdjustment{
		outcome: patchResult.Outcome, current: current, animeID: cmd.AnimeID,
		source: source, correlationID: correlationID,
		occurredAtMs: occurredAtMs, nextProgress: nextProgress,
	}
	if err := s.recordEpisodeAdjustment(ctx, adjustment); err != nil {
		return EpisodeCommandResult{}, err
	}

	return episodeCommandResult(patchResult, current.Name, current.Status, nextProgress, occurredAtMs, correlationID), nil
}

// buildEpisodeProgressPatch creates the anime patch for an episode progress adjustment.
func buildEpisodeProgressPatch(current *contracts.MobileAnime, nextProgress float64, occurredAtMs int64, base *int64) contracts.AnimePatch {
	patch := contracts.AnimePatch{
		NroCapVisto:      &nextProgress,
		FechaUltCapVisto: &occurredAtMs,
		Base:             base,
	}
	if current.PremieredAt == nil && current.LastWatchedAt == nil {
		patch.FechaEstreno = &occurredAtMs
	}
	return patch
}

// defaultActivitySource returns the desktop source when no activity source is provided.
func defaultActivitySource(source string) string {
	if source == "" {
		return ActivitySourceDesktop
	}
	return source
}

// activityCorrelationID builds the correlation identifier for an episode activity.
func activityCorrelationID(animeID string, occurredAtMs int64) string {
	return fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, animeID, occurredAtMs)
}

// recordEpisodeAdjustment records an applied episode progress adjustment as activity.
func (s *EpisodeService) recordEpisodeAdjustment(ctx context.Context, a episodeAdjustment) error {
	if s.activity == nil || a.outcome != contracts.AnimePatchOutcomeApplied {
		return nil
	}
	return s.activity.RecordActivity(ctx, ActivityRecord{
		Source:        a.source,
		ActionType:    activity.ActionEpisodeAdjusted,
		AnimeID:       a.animeID,
		AnimeName:     a.current.Name,
		OccurredAtMs:  a.occurredAtMs,
		CorrelationID: a.correlationID,
		Before: ActivityAnimeSnapshot{
			Estado:      a.current.Status,
			NroCapVisto: a.current.EpisodesWatched,
			Activo:      a.current.Active,
		},
		After: ActivityAnimeSnapshot{
			Estado:      a.current.Status,
			NroCapVisto: a.nextProgress,
			Activo:      a.current.Active,
		},
	})
}

// episodeCommandResult builds the command result for an episode patch.
func episodeCommandResult(
	patch contracts.AnimePatchResult,
	animeName string,
	estado int,
	progress float64,
	occurredAtMs int64,
	correlationID string,
) EpisodeCommandResult {
	return EpisodeCommandResult{
		AnimeID: patch.AnimeID, Outcome: patch.Outcome, ModifiedAt: patch.ModifiedAt, ConflictID: patch.ConflictID,
		AnimeName: animeName, Estado: estado, NroCapVisto: progress,
		OccurredAtMs: occurredAtMs, CorrelationID: correlationID,
	}
}

// isAllowedEpisodeDelta reports whether an episode adjustment uses a supported increment.
func isAllowedEpisodeDelta(delta float64) bool {
	return delta == 1 || delta == -1 || delta == 0.5 || delta == -0.5
}

// matchingScheduleDay returns the schedule day matching the requested day.
func matchingScheduleDay(days []contracts.MobileAnimeDay, requestedDay string) (contracts.MobileAnimeDay, bool) {
	for _, day := range days {
		if day.Day == requestedDay {
			return day, true
		}
	}
	return contracts.MobileAnimeDay{}, false
}

// episodeAdjustment is one applied episode-progress change, as the activity log
// needs to see it.
//
// A struct rather than a parameter list (SonarQube go:S107): animeID, source and
// correlationID sat adjacent as three strings, where swapping any two compiles
// and writes the wrong activity row.
type episodeAdjustment struct {
	outcome       contracts.AnimePatchOutcome
	current       *contracts.MobileAnime
	animeID       string
	source        string
	correlationID string
	occurredAtMs  int64
	nextProgress  float64
}
