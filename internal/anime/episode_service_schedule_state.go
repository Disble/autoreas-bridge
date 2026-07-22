package anime

import (
	"context"
	"sort"

	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api/contracts"
)

// ListEpisodeSchedule returns active anime scheduled for one day or Estrenos section.
func (s *EpisodeService) ListEpisodeSchedule(ctx context.Context, query EpisodeScheduleQuery) ([]EpisodeScheduleItem, error) {
	items, err := s.query.ListMobileAnimes(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]EpisodeScheduleItem, 0, len(items))
	for _, item := range items {
		if item.Active == 0 {
			continue
		}
		day, ok := matchingScheduleDay(item.Days, query.Day)
		if !ok {
			continue
		}
		coverValue := ""
		if item.Cover != nil {
			coverValue = *item.Cover
		}
		result = append(result, EpisodeScheduleItem{
			AnimeID:      item.ID,
			AnimeName:    item.Name,
			Estado:       item.Status,
			NroCapVisto:  item.EpisodesWatched,
			TotalCap:     item.TotalEpisodes,
			Day:          day.Day,
			DayOrder:     day.Order,
			ModifiedAt:   item.ModifiedAt,
			FolderPath:   legacyStringValue(item.Folder),
			PageURL:      legacyStringValue(item.SourceURL),
			HasCover:     cover.Classify(coverValue) != cover.KindAbsent,
			LastWatched:  item.LastWatchedAt,
			FirstWatched: item.PremieredAt,
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

// SetAnimeState updates one anime estado and records activity when the write applies.
func (s *EpisodeService) SetAnimeState(ctx context.Context, cmd SetAnimeStateCommand) (EpisodeCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{Estado: &cmd.Estado, Base: cmd.Base})
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	source := defaultActivitySource(cmd.Source)
	correlationID := activityCorrelationID(cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionAnimeStateSet,
			AnimeID:       cmd.AnimeID,
			AnimeName:     current.Name,
			OccurredAtMs:  occurredAtMs,
			CorrelationID: correlationID,
			Before:        ActivityAnimeSnapshot{Estado: current.Status, NroCapVisto: current.EpisodesWatched, Activo: current.Active},
			After:         ActivityAnimeSnapshot{Estado: cmd.Estado, NroCapVisto: current.EpisodesWatched, Activo: current.Active},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Name, cmd.Estado, current.EpisodesWatched, occurredAtMs, correlationID), nil
}

// SetAnimeDays rewrites dias[] without recording a watch-state activity entry.
func (s *EpisodeService) SetAnimeDays(ctx context.Context, cmd SetAnimeDaysCommand) (EpisodeCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return EpisodeCommandResult{}, err
	}
	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{Dias: cmd.Dias, Base: cmd.Base, PreserveLastWatched: true})
	if err != nil {
		return EpisodeCommandResult{}, err
	}
	return episodeCommandResult(patchResult, current.Name, current.Status, current.EpisodesWatched, occurredAtMs, ""), nil
}

// SoftDeleteAnime deactivates one anime and records activity when the write applies.
func (s *EpisodeService) SoftDeleteAnime(ctx context.Context, cmd SoftDeleteAnimeCommand) (EpisodeCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return EpisodeCommandResult{}, err
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
		return EpisodeCommandResult{}, err
	}

	source := defaultActivitySource(cmd.Source)
	correlationID := activityCorrelationID(cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionAnimeSoftDeleted,
			AnimeID:       cmd.AnimeID,
			AnimeName:     current.Name,
			OccurredAtMs:  occurredAtMs,
			CorrelationID: correlationID,
			Before:        ActivityAnimeSnapshot{Estado: current.Status, NroCapVisto: current.EpisodesWatched, Activo: current.Active},
			After:         ActivityAnimeSnapshot{Estado: current.Status, NroCapVisto: current.EpisodesWatched, Activo: 0},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Name, current.Status, current.EpisodesWatched, occurredAtMs, correlationID), nil
}
