package anime

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
)

// RestoreAnime reactivates one anime and records activity when the write applies.
func (s *EpisodeService) RestoreAnime(ctx context.Context, cmd RestoreAnimeCommand) (EpisodeCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	occurredAtMs := s.now().UnixMilli()
	active := true
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{
		Activo:                &active,
		ClearFechaEliminacion: true,
		PreserveLastWatched:   true,
		Base:                  cmd.Base,
	})
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	source := cmd.Source
	if source == "" {
		source = ActivitySourceDesktop
	}
	correlationID := fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionAnimeRestored,
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
				Activo:      1,
			},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Nombre, current.Estado, current.NroCapVisto, occurredAtMs, correlationID), nil
}

// RepeatAnime marks one anime as repeated and records activity when the write applies.
func (s *EpisodeService) RepeatAnime(ctx context.Context, cmd RepeatAnimeCommand) (EpisodeCommandResult, error) {
	current, err := s.query.GetMobileAnime(ctx, cmd.AnimeID)
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	occurredAtMs := s.now().UnixMilli()
	patchResult, err := s.writer.PatchAnime(ctx, cmd.AnimeID, contracts.AnimePatch{
		RepeatAt:            &occurredAtMs,
		PreserveLastWatched: true,
		Base:                cmd.Base,
	})
	if err != nil {
		return EpisodeCommandResult{}, err
	}

	source := cmd.Source
	if source == "" {
		source = ActivitySourceDesktop
	}
	correlationID := fmt.Sprintf("%s:%s:%d", defaultActivityCorrelationType, cmd.AnimeID, occurredAtMs)
	if s.activity != nil && patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if err := s.activity.RecordActivity(ctx, ActivityRecord{
			Source:        source,
			ActionType:    ActivityActionAnimeRepeated,
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
				Estado:      0,
				NroCapVisto: 0,
				Activo:      1,
			},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Nombre, 0, 0, occurredAtMs, correlationID), nil
}
