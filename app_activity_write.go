package main

import (
	"context"
	"fmt"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

type activityAnimeWriteService struct {
	query    contracts.AnimeQueryService
	writer   contracts.AnimeWriteService
	recorder anime.ActivityRecorder
	source   string
	now      func() int64
}

func (s activityAnimeWriteService) PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) (contracts.AnimePatchResult, error) {
	before, err := s.query.GetMobileAnime(ctx, id)
	if err != nil {
		return contracts.AnimePatchResult{}, err
	}
	result, err := s.writer.PatchAnime(ctx, id, patch)
	if err != nil {
		return contracts.AnimePatchResult{}, err
	}
	if result.Outcome != contracts.AnimePatchOutcomeApplied || s.recorder == nil {
		return result, nil
	}

	after := anime.ActivityAnimeSnapshot{
		Estado:      before.Estado,
		NroCapVisto: before.NroCapVisto,
		Activo:      before.Activo,
	}
	actionType := ""
	if patch.Estado != nil {
		after.Estado = *patch.Estado
		actionType = anime.ActivityActionAnimeStateSet
	}
	if patch.NroCapVisto != nil {
		after.NroCapVisto = *patch.NroCapVisto
		actionType = anime.ActivityActionChapterAdjusted
	}
	if patch.Activo != nil {
		if *patch.Activo {
			after.Activo = 1
			actionType = anime.ActivityActionAnimeRestored
		} else {
			after.Activo = 0
			actionType = anime.ActivityActionAnimeSoftDeleted
		}
	}
	if patch.RepeatAt != nil {
		after.Estado = 0
		after.NroCapVisto = 0
		after.Activo = 1
		actionType = anime.ActivityActionAnimeRepeated
	}
	if actionType == "" {
		return result, nil
	}

	now := s.now
	if now == nil {
		now = func() int64 { return 0 }
	}
	occurredAtMs := now()
	source := s.source
	if source == "" {
		source = anime.ActivitySourceSystem
	}
	if err := s.recorder.RecordActivity(ctx, anime.ActivityRecord{
		Source:        source,
		ActionType:    actionType,
		AnimeID:       id,
		AnimeName:     before.Nombre,
		OccurredAtMs:  occurredAtMs,
		CorrelationID: fmt.Sprintf("anime.patch:%s:%d", id, occurredAtMs),
		Before: anime.ActivityAnimeSnapshot{
			Estado:      before.Estado,
			NroCapVisto: before.NroCapVisto,
			Activo:      before.Activo,
		},
		After: after,
	}); err != nil {
		return contracts.AnimePatchResult{}, err
	}
	return result, nil
}
