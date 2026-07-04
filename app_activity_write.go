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

func (s activityAnimeWriteService) PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) error {
	before, err := s.query.GetMobileAnime(ctx, id)
	if err != nil {
		return err
	}
	if err := s.writer.PatchAnime(ctx, id, patch); err != nil {
		return err
	}
	if s.recorder == nil {
		return nil
	}

	after := anime.ActivityAnimeSnapshot{
		Estado:      before.Estado,
		NroCapVisto: before.NroCapVisto,
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
	if actionType == "" {
		return nil
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
	return s.recorder.RecordActivity(ctx, anime.ActivityRecord{
		Source:        source,
		ActionType:    actionType,
		AnimeID:       id,
		AnimeName:     before.Nombre,
		OccurredAtMs:  occurredAtMs,
		CorrelationID: fmt.Sprintf("anime.patch:%s:%d", id, occurredAtMs),
		Before: anime.ActivityAnimeSnapshot{
			Estado:      before.Estado,
			NroCapVisto: before.NroCapVisto,
		},
		After: after,
	})
}
