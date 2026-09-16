package anime

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/watchhistory"
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
			AnimeName:     current.Name,
			OccurredAtMs:  occurredAtMs,
			CorrelationID: correlationID,
			Before: ActivityAnimeSnapshot{
				Estado:      current.Status,
				NroCapVisto: current.EpisodesWatched,
				Activo:      current.Active,
			},
			After: ActivityAnimeSnapshot{
				Estado:      current.Status,
				NroCapVisto: current.EpisodesWatched,
				Activo:      1,
			},
		}); err != nil {
			return EpisodeCommandResult{}, err
		}
	}

	return episodeCommandResult(patchResult, current.Name, current.Status, current.EpisodesWatched, occurredAtMs, correlationID), nil
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
	if patchResult.Outcome == contracts.AnimePatchOutcomeApplied {
		if s.activity != nil {
			if err := s.activity.RecordActivity(ctx, ActivityRecord{
				Source:        source,
				ActionType:    ActivityActionAnimeRepeated,
				AnimeID:       cmd.AnimeID,
				AnimeName:     current.Name,
				OccurredAtMs:  occurredAtMs,
				CorrelationID: correlationID,
				Before: ActivityAnimeSnapshot{
					Estado:      current.Status,
					NroCapVisto: current.EpisodesWatched,
					Activo:      current.Active,
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
		// A repeat carries CycleReset: the episodes watched in the closing
		// cycle are still watched, so this MUST record nothing and retract
		// nothing (design.md D3) -- Derive's guard 1 enforces it regardless
		// of the Before/After values supplied here.
		s.recordWatch(ctx, cmd.AnimeID, watchhistory.Change{
			AnimeID:        cmd.AnimeID,
			AnimeName:      current.Name,
			Source:         source,
			OccurredAtMS:   occurredAtMs,
			BeforeEpisodes: current.EpisodesWatched,
			AfterEpisodes:  0,
			Cycle:          int64(len(current.Repetitions)) + 1,
			CycleReset:     true,
		})
	}

	return episodeCommandResult(patchResult, current.Name, 0, 0, occurredAtMs, correlationID), nil
}
