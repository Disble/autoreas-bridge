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
		result = append(result, EpisodeScheduleItem{
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
			AnimeName:     current.Nombre,
			OccurredAtMs:  occurredAtMs,
			CorrelationID: correlationID,
			Before:        ActivityAnimeSnapshot{Estado: current.Estado, NroCapVisto: current.NroCapVisto, Activo: current.Activo},
			After:         ActivityAnimeSnapshot{Estado: cmd.Estado, NroCapVisto: current.NroCapVisto, Activo: current.Activo},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Nombre, cmd.Estado, current.NroCapVisto, occurredAtMs, correlationID), nil
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
	return episodeCommandResult(patchResult, current.Nombre, current.Estado, current.NroCapVisto, occurredAtMs, ""), nil
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
			AnimeName:     current.Nombre,
			OccurredAtMs:  occurredAtMs,
			CorrelationID: correlationID,
			Before:        ActivityAnimeSnapshot{Estado: current.Estado, NroCapVisto: current.NroCapVisto, Activo: current.Activo},
			After:         ActivityAnimeSnapshot{Estado: current.Estado, NroCapVisto: current.NroCapVisto, Activo: 0},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Nombre, current.Estado, current.NroCapVisto, occurredAtMs, correlationID), nil
}
