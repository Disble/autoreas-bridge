package anime

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api/contracts"
)

const (
	ActivitySourceDesktop           = "desktop"
	ActivitySourceMobile            = "mobile"
	ActivitySourceSystem            = "system"
	ActivitySourceLegacy            = "legacy"
	ActivityActionChapterAdjusted   = "chapter_adjusted"
	ActivityActionAnimeStateSet     = "anime_state_set"
	ActivityActionAnimeSoftDeleted  = "anime_soft_deleted"
	ActivityActionAnimeRestored     = "anime_restored"
	ActivityActionAnimeRepeated     = "anime_repeated"
	ActivityActionAnimePageOpened   = "anime_page_opened"
	ActivityActionAnimePageCopied   = "anime_page_copied"
	ActivityActionAnimeFolderOpened = "anime_folder_opened"
	ActivityActionAnimeFolderCopied = "anime_folder_copied"
	defaultActivityCorrelationType  = "anime.chapter"
)

var (
	ErrInvalidChapterDelta      = errors.New("invalid chapter delta")
	ErrChapterProgressBlocked   = errors.New("chapter progress is blocked by anime state")
	ErrChapterProgressBelowZero = errors.New("chapter progress cannot go below zero")
)

type ChapterQuery interface {
	GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error)
	ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error)
}

type ChapterWriter interface {
	PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) (contracts.AnimePatchResult, error)
}

type ActivityRecorder interface {
	RecordActivity(ctx context.Context, record ActivityRecord) error
}

type ChapterServiceDeps struct {
	Query    ChapterQuery
	Writer   ChapterWriter
	Activity ActivityRecorder
	Now      func() time.Time
}

type ChapterScheduleQuery struct {
	Day string
}

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

type ChapterService struct {
	query    ChapterQuery
	writer   ChapterWriter
	activity ActivityRecorder
	now      func() time.Time
}

type AdjustWatchedChaptersCommand struct {
	AnimeID string
	Delta   float64
	Base    *int64
	Source  string
}

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

type SoftDeleteAnimeCommand struct {
	AnimeID string
	Base    *int64
	Source  string
}

type RestoreAnimeCommand struct {
	AnimeID string
	Base    *int64
	Source  string
}

type RepeatAnimeCommand struct {
	AnimeID string
	Base    *int64
	Source  string
}

type ChapterCommandResult struct {
	AnimeID       string
	Outcome       AnimePatchOutcome
	ModifiedAt    int64
	ConflictID    string
	AnimeName     string
	Estado        int
	NroCapVisto   float64
	OccurredAtMs  int64
	CorrelationID string
}

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

type ActivityAnimeSnapshot struct {
	Estado      int
	NroCapVisto float64
	Activo      int
}

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

func (s *ChapterService) ListChapterSchedule(ctx context.Context, query ChapterScheduleQuery) ([]ChapterScheduleItem, error) {
	items, err := s.query.ListMobileAnimes(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]ChapterScheduleItem, 0, len(items))
	for _, item := range items {
		if item.Activo == 0 {
			continue
		}
		day, ok := matchingScheduleDay(item.Dias, query.Day)
		if !ok {
			continue
		}
		portada := ""
		if item.Portada != nil {
			portada = *item.Portada
		}
		result = append(result, ChapterScheduleItem{
			AnimeID:      item.ID,
			AnimeName:    item.Nombre,
			Estado:       item.Estado,
			NroCapVisto:  item.NroCapVisto,
			TotalCap:     item.TotalCap,
			Day:          day.Dia,
			DayOrder:     day.Orden,
			ModifiedAt:   item.ModifiedAt,
			FolderPath:   legacyStringValue(item.Carpeta),
			PageURL:      legacyStringValue(item.Pagina),
			HasCover:     cover.Classify(portada) != cover.KindAbsent,
			LastWatched:  item.FechaUltCapVisto,
			FirstWatched: item.FechaEstreno,
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		if result[i].DayOrder == result[j].DayOrder {
			return result[i].AnimeName < result[j].AnimeName
		}
		return result[i].DayOrder < result[j].DayOrder
	})
	return result, nil
}

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
	patch := contracts.AnimePatch{
		NroCapVisto:      &nextProgress,
		FechaUltCapVisto: &occurredAtMs,
		Base:             cmd.Base,
	}
	if current.FechaEstreno == nil && current.FechaUltCapVisto == nil {
		patch.FechaEstreno = &occurredAtMs
	}

	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, patch)
	if err != nil {
		return ChapterCommandResult{}, err
	}

	source := cmd.Source
	if source == "" {
		source = ActivitySourceDesktop
	}
	correlationID := fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionChapterAdjusted,
			AnimeID:       cmd.AnimeID,
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
		}); err != nil {
			return ChapterCommandResult{}, err
		}
	}

	return chapterCommandResult(patchResult, current.Nombre, current.Estado, nextProgress, occurredAtMs, correlationID), nil
}

func (s *ChapterService) SetAnimeState(ctx context.Context, cmd SetAnimeStateCommand) (ChapterCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return ChapterCommandResult{}, err
	}

	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{
		Estado: &cmd.Estado,
		Base:   cmd.Base,
	})
	if err != nil {
		return ChapterCommandResult{}, err
	}

	source := cmd.Source
	if source == "" {
		source = ActivitySourceDesktop
	}
	correlationID := fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionAnimeStateSet,
			AnimeID:       cmd.AnimeID,
			AnimeName:     current.Nombre,
			OccurredAtMs:  occurredAtMs,
			CorrelationID: correlationID,
			Before: ActivityAnimeSnapshot{
				Estado:      current.Estado,
				NroCapVisto: current.NroCapVisto,
				Activo:      current.Activo,
			},
			After: ActivityAnimeSnapshot{
				Estado:      cmd.Estado,
				NroCapVisto: current.NroCapVisto,
				Activo:      current.Activo,
			},
		}); err != nil {
			return ChapterCommandResult{}, err
		}
	}

	return chapterCommandResult(patchResult, current.Nombre, cmd.Estado, current.NroCapVisto, occurredAtMs, correlationID), nil
}

// SetAnimeDays writes the anime's dias[] array (day/order or Estrenos section).
// It is a schedule change, not a watch-state change, so it records no activity.
func (s *ChapterService) SetAnimeDays(ctx context.Context, cmd SetAnimeDaysCommand) (ChapterCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return ChapterCommandResult{}, err
	}
	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{
		Dias:                cmd.Dias,
		Base:                cmd.Base,
		PreserveLastWatched: true,
	})
	if err != nil {
		return ChapterCommandResult{}, err
	}
	return chapterCommandResult(patchResult, current.Nombre, current.Estado, current.NroCapVisto, occurredAtMs, ""), nil
}

func (s *ChapterService) SoftDeleteAnime(ctx context.Context, cmd SoftDeleteAnimeCommand) (ChapterCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return ChapterCommandResult{}, err
	}

	occurredAtMs := s.now().UnixMilli()
	inactive := false
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{
		Activo:              &inactive,
		FechaEliminacion:    &occurredAtMs,
		PreserveLastWatched: true,
		Base:                cmd.Base,
	})
	if err != nil {
		return ChapterCommandResult{}, err
	}

	source := cmd.Source
	if source == "" {
		source = ActivitySourceDesktop
	}
	correlationID := fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionAnimeSoftDeleted,
			AnimeID:       cmd.AnimeID,
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
				NroCapVisto: current.NroCapVisto,
				Activo:      0,
			},
		}); err != nil {
			return ChapterCommandResult{}, err
		}
	}

	return chapterCommandResult(patchResult, current.Nombre, current.Estado, current.NroCapVisto, occurredAtMs, correlationID), nil
}

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

func isAllowedChapterDelta(delta float64) bool {
	return delta == 1 || delta == -1 || delta == 0.5 || delta == -0.5
}

func matchingScheduleDay(days []contracts.MobileAnimeDay, requestedDay string) (contracts.MobileAnimeDay, bool) {
	for _, day := range days {
		if day.Dia == requestedDay {
			return day, true
		}
	}
	return contracts.MobileAnimeDay{}, false
}
