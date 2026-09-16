package anime

import (
	"context"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/watchhistory"
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
	ActivityActionAnimeRepeated    = "anime_repeated"
	defaultActivityCorrelationType = "anime.episode"
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

// WatchRecorder persists the real per-episode watch-history projection,
// diff-derived from the applied patch (design.md D2/D4). A failure degrades
// to a warn log rather than failing the user's action: the underlying
// projection is derived from the audit log, which already committed by the
// time this runs.
type WatchRecorder interface {
	RecordWatch(ctx context.Context, change watchhistory.Change) error
}

// RecordWatch runs recorder's RecordWatch and degrades a failure to a warn
// log under domain="watch-history" rather than propagating it (design.md
// D4). Both live write paths -- EpisodeService here and desktop's mobile
// write service -- share this exact guard, so its truth table is proven
// once rather than once per caller. A nil recorder is a no-op, matching
// every other lazily wired write-path collaborator.
func RecordWatch(ctx context.Context, recorder WatchRecorder, log logger.Logger, animeID string, change watchhistory.Change) {
	if recorder == nil {
		return
	}
	if err := recorder.RecordWatch(ctx, change); err != nil && log != nil {
		log.Warnf("watch-history", "record watch history for anime %s: %v", animeID, err)
	}
}

// EpisodeServiceDeps wires the ports required by EpisodeService.
type EpisodeServiceDeps struct {
	Query    EpisodeQuery
	Writer   EpisodeWriter
	Activity ActivityRecorder
	Watch    WatchRecorder
	Logger   logger.Logger
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
	watch    WatchRecorder
	logger   logger.Logger
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
	// ReportedAtMS is the instant the change reported for itself, or 0 when it
	// reported none. It travels beside OccurredAtMs rather than replacing it:
	// the row's own instant stays the moment the bridge observed the change, and
	// the correlation id built from it must not move (design.md D4).
	ReportedAtMS int64
	Before       ActivityAnimeSnapshot
	After        ActivityAnimeSnapshot
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
		watch:    deps.Watch,
		logger:   deps.Logger,
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

// recordEpisodeAdjustment records an applied episode progress adjustment as
// activity, then records the real watch-history projection from the same
// before/after diff (design.md D4). Watch recording runs independent of
// whether an ActivityRecorder is wired: it is a separate collaborator, not a
// side effect of the activity write.
func (s *EpisodeService) recordEpisodeAdjustment(ctx context.Context, a episodeAdjustment) error {
	if a.outcome != contracts.AnimePatchOutcomeApplied {
		return nil
	}
	if s.activity != nil {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
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
		}); err != nil {
			return err
		}
	}
	s.recordWatch(ctx, a.animeID, watchhistory.Change{
		AnimeID:        a.animeID,
		AnimeName:      a.current.Name,
		Source:         a.source,
		OccurredAtMS:   a.occurredAtMs,
		BeforeEpisodes: a.current.EpisodesWatched,
		AfterEpisodes:  a.nextProgress,
		Cycle:          int64(len(a.current.Repetitions)) + 1,
	})
	return nil
}

// recordWatch persists change on the real watch-history projection through
// the shared RecordWatch guard above.
func (s *EpisodeService) recordWatch(ctx context.Context, animeID string, change watchhistory.Change) {
	RecordWatch(ctx, s.watch, s.logger, animeID, change)
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
