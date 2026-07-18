package anime

import (
	"context"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/api/contracts"
)

const (
	// ActivitySourceDesktop marks a desktop-initiated chapter action.
	ActivitySourceDesktop = "desktop"
	// ActivitySourceMobile marks a mobile-initiated chapter action.
	ActivitySourceMobile = "mobile"
	// ActivitySourceSystem marks a system-initiated chapter action.
	ActivitySourceSystem = "system"
	// ActivitySourceLegacy marks a legacy-observed chapter action.
	ActivitySourceLegacy = "legacy"
	// ActivityActionChapterAdjusted marks a chapter progress mutation.
	ActivityActionChapterAdjusted = "chapter_adjusted"
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
	defaultActivityCorrelationType  = "anime.chapter"
)

var (
	// ErrInvalidChapterDelta reports a chapter delta outside the supported increments.
	ErrInvalidChapterDelta = errors.New("invalid chapter delta")
	// ErrChapterProgressBlocked reports chapter progress blocked by the current anime state.
	ErrChapterProgressBlocked = errors.New("chapter progress is blocked by anime state")
	// ErrChapterProgressBelowZero reports a chapter decrement below zero progress.
	ErrChapterProgressBelowZero = errors.New("chapter progress cannot go below zero")
)

// ChapterQuery loads the read models required by chapter mutations.
type ChapterQuery interface {
	GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error)
	ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error)
}

// ChapterWriter applies chapter-related anime patches.
type ChapterWriter interface {
	PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) (contracts.AnimePatchResult, error)
}

// ActivityRecorder persists user-visible anime activity entries.
type ActivityRecorder interface {
	RecordActivity(ctx context.Context, record ActivityRecord) error
}

// ChapterServiceDeps wires the ports required by ChapterService.
type ChapterServiceDeps struct {
	Query    ChapterQuery
	Writer   ChapterWriter
	Activity ActivityRecorder
	Now      func() time.Time
}

// ChapterScheduleQuery filters chapter schedule items by day/section.
type ChapterScheduleQuery struct {
	Day string
}

// ChapterScheduleItem is the read model returned by ListChapterSchedule.
type ChapterScheduleItem struct {
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

// ChapterService owns chapter progress and related lifecycle mutations.
type ChapterService struct {
	query    ChapterQuery
	writer   ChapterWriter
	activity ActivityRecorder
	now      func() time.Time
}

// AdjustWatchedChaptersCommand increments or decrements watched progress.
type AdjustWatchedChaptersCommand struct {
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

// ChapterCommandResult returns the semantic outcome of one chapter mutation.
type ChapterCommandResult struct {
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

// NewChapterService builds a ChapterService with default clock behavior.
func NewChapterService(deps ChapterServiceDeps) *ChapterService {
	now := deps.Now
	if now == nil {
		now = time.Now
	}
	return &ChapterService{
		query:    deps.Query,
		writer:   deps.Writer,
		activity: deps.Activity,
		now:      now,
	}
}

// AdjustWatchedChapters updates watched progress using the supported +/- 1 and +/- 0.5 steps.
func (s *ChapterService) AdjustWatchedChapters(ctx context.Context, cmd AdjustWatchedChaptersCommand) (ChapterCommandResult, error) {
	if !isAllowedChapterDelta(cmd.Delta) {
		return ChapterCommandResult{}, ErrInvalidChapterDelta
	}

	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return ChapterCommandResult{}, err
	}
	if current.Estado > 0 {
		return ChapterCommandResult{}, ErrChapterProgressBlocked
	}

	nextProgress := current.NroCapVisto + cmd.Delta
	if nextProgress < 0 {
		return ChapterCommandResult{}, ErrChapterProgressBelowZero
	}

	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, buildChapterProgressPatch(current, nextProgress, occurredAtMs, cmd.Base))
	if err != nil {
		return ChapterCommandResult{}, err
	}

	source := defaultActivitySource(cmd.Source)
	correlationID := activityCorrelationID(cmd.AnimeID, occurredAtMs)
	if err := s.recordChapterAdjustment(ctx, patchResult.Outcome, current, cmd.AnimeID, source, correlationID, occurredAtMs, nextProgress); err != nil {
		return ChapterCommandResult{}, err
	}

	return chapterCommandResult(patchResult, current.Nombre, current.Estado, nextProgress, occurredAtMs, correlationID), nil
}

// buildChapterProgressPatch creates the anime patch for a chapter progress adjustment.
func buildChapterProgressPatch(current *contracts.MobileAnime, nextProgress float64, occurredAtMs int64, base *int64) contracts.AnimePatch {
	patch := contracts.AnimePatch{
		NroCapVisto:      &nextProgress,
		FechaUltCapVisto: &occurredAtMs,
		Base:             base,
	}
	if current.FechaEstreno == nil && current.FechaUltCapVisto == nil {
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

// activityCorrelationID builds the correlation identifier for a chapter activity.
func activityCorrelationID(animeID string, occurredAtMs int64) string {
	return fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, animeID, occurredAtMs)
}

// recordChapterAdjustment records an applied chapter progress adjustment as activity.
func (s *ChapterService) recordChapterAdjustment(ctx context.Context, outcome contracts.AnimePatchOutcome, current *contracts.MobileAnime, animeID string, source string, correlationID string, occurredAtMs int64, nextProgress float64) error {
	if s.activity == nil || outcome != contracts.AnimePatchOutcomeApplied {
		return nil
	}
	return s.activity.RecordActivity(ctx, ActivityRecord{
		Source:        source,
		ActionType:    ActivityActionChapterAdjusted,
		AnimeID:       animeID,
		AnimeName:     current.Nombre,
		OccurredAtMs:  occurredAtMs,
		CorrelationID: correlationID,
		Before: ActivityAnimeSnapshot{
			Estado:      current.Estado,
			NroCapVisto: current.NroCapVisto,
			Activo:      current.Activo,
		},
		After: ActivityAnimeSnapshot{
			Estado:      current.Estado,
			NroCapVisto: nextProgress,
			Activo:      current.Activo,
		},
	})
}

// chapterCommandResult builds the command result for a chapter patch.
func chapterCommandResult(
	patch contracts.AnimePatchResult,
	animeName string,
	estado int,
	progress float64,
	occurredAtMs int64,
	correlationID string,
) ChapterCommandResult {
	return ChapterCommandResult{
		AnimeID: patch.AnimeID, Outcome: patch.Outcome, ModifiedAt: patch.ModifiedAt, ConflictID: patch.ConflictID,
		AnimeName: animeName, Estado: estado, NroCapVisto: progress,
		OccurredAtMs: occurredAtMs, CorrelationID: correlationID,
	}
}

// isAllowedChapterDelta reports whether a chapter adjustment uses a supported increment.
func isAllowedChapterDelta(delta float64) bool {
	return delta == 1 || delta == -1 || delta == 0.5 || delta == -0.5
}

// matchingScheduleDay returns the schedule day matching the requested day.
func matchingScheduleDay(days []contracts.MobileAnimeDay, requestedDay string) (contracts.MobileAnimeDay, bool) {
	for _, day := range days {
		if day.Dia == requestedDay {
			return day, true
		}
	}
	return contracts.MobileAnimeDay{}, false
}
