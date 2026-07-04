package main

import (
	"context"
	"testing"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestActivityAnimeWriteServiceRecordsMobilePatch(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":1,"estado":0,"activo":true}`, 1000)

	writer := anime.NewWriteService(store, &stubAppUpdateWriter{})
	recorder := activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(db))}
	service := activityAnimeWriteService{
		query:    anime.NewQueryService(store),
		writer:   writer,
		recorder: recorder,
		source:   anime.ActivitySourceMobile,
		now:      func() int64 { return 1710000000123 },
	}

	progress := 2.0
	base := int64(1000)
	if err := service.PatchAnime(ctx, "anime-1", contracts.AnimePatch{NroCapVisto: &progress, Base: &base}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 mobile activity row, got %#v", records)
	}
	if records[0].Source != activity.SourceMobile || records[0].ActionType != activity.ActionChapterAdjusted {
		t.Fatalf("unexpected mobile activity row: %#v", records[0])
	}
}

func TestActivityAnimeWriteServiceRecordsMobileSoftDelete(t *testing.T) {
	ctx := context.Background()
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Frieren","nrocapvisto":1,"estado":0,"activo":true}`, 1000)

	writer := anime.NewWriteService(store, &stubAppUpdateWriter{})
	recorder := activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(db))}
	service := activityAnimeWriteService{
		query:    anime.NewQueryService(store),
		writer:   writer,
		recorder: recorder,
		source:   anime.ActivitySourceMobile,
		now:      func() int64 { return 1710000000123 },
	}

	active := false
	deletedAt := int64(1710000000123)
	base := int64(1000)
	if err := service.PatchAnime(ctx, "anime-1", contracts.AnimePatch{
		Activo:              &active,
		FechaEliminacion:    &deletedAt,
		PreserveLastWatched: true,
		Base:                &base,
	}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	records, err := activity.NewStore(activity.NewSQLiteProvider(db)).ListRecent(ctx, activity.ListQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list activity rows: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 mobile activity row, got %#v", records)
	}
	if records[0].Source != activity.SourceMobile || records[0].ActionType != activity.ActionAnimeSoftDeleted {
		t.Fatalf("unexpected mobile activity row: %#v", records[0])
	}
}
