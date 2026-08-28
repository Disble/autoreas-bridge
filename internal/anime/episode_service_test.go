package anime_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestEpisodeServiceAdjustWatchedEpisodesWritesProgressAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Dungeon Meshi","episodesWatched":2.5,"status":0,"totalEpisodes":24,"active":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	activityRecorder := &stubEpisodeActivityRecorder{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activityRecorder,
		Now:      func() time.Time { return time.UnixMilli(1710000000123).UTC() },
	})

	result, err := service.AdjustWatchedEpisodes(ctx, anime.AdjustWatchedEpisodesCommand{
		AnimeID: "anime-1",
		Delta:   0.5,
		Base:    new(int64(1000)),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("adjust watched episodes: %v", err)
	}

	assertEpisodeAdjustmentResult(t, ctx, store, result, activityRecorder)
}

// assertEpisodeAdjustmentResult verifies the episode adjustment outcome.
func assertEpisodeAdjustmentResult(t *testing.T, ctx context.Context, store *bridgeSync.AnimeSnapshotStore, result anime.EpisodeCommandResult, activityRecorder *stubEpisodeActivityRecorder) {
	t.Helper()
	if result.NroCapVisto != 3 {
		t.Fatalf("expected resulting progress 3, got %v", result.NroCapVisto)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if value.Progress != 3 || value.LastWatchedAt == nil || value.LastWatchedAt.UnixMilli() != 1710000000123 || value.PremieredAt == nil || value.PremieredAt.UnixMilli() != 1710000000123 {
		t.Fatalf("expected the finalized snapshot to persist progress and timestamps, got %#v", value)
	}
	if len(activityRecorder.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activityRecorder.records))
	}
	record := activityRecorder.records[0]
	if record.ActionType != activity.ActionEpisodeAdjusted || record.AnimeID != "anime-1" || record.AnimeName != "Dungeon Meshi" || record.Source != anime.ActivitySourceDesktop || record.Before.NroCapVisto != 2.5 || record.After.NroCapVisto != 3 {
		t.Fatalf("unexpected adjustment record: %#v", record)
	}
}

func TestEpisodeServiceAdjustWatchedEpisodesRejectsBlockedStates(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Paused","episodesWatched":4,"status":3,"totalEpisodes":12,"active":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, writer),
	})

	_, err := service.AdjustWatchedEpisodes(ctx, anime.AdjustWatchedEpisodesCommand{
		AnimeID: "anime-1",
		Delta:   1,
		Base:    new(int64(1000)),
	})
	if !errors.Is(err, anime.ErrEpisodeProgressBlocked) {
		t.Fatalf("expected blocked progress error, got %v", err)
	}
	current, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("expected no finalized write for blocked state: %#v, %v", current, err)
	}
}

func TestEpisodeServiceAdjustWatchedEpisodesRejectsNegativeProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Start","episodesWatched":0,"status":0,"totalEpisodes":12,"active":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, writer),
	})

	_, err := service.AdjustWatchedEpisodes(ctx, anime.AdjustWatchedEpisodesCommand{
		AnimeID: "anime-1",
		Delta:   -0.5,
		Base:    new(int64(1000)),
	})
	if !errors.Is(err, anime.ErrEpisodeProgressBelowZero) {
		t.Fatalf("expected below-zero progress error, got %v", err)
	}
	current, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("expected no finalized write for negative progress: %#v, %v", current, err)
	}
}

func TestEpisodeServiceSetAnimeDaysWritesDias(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Frieren","episodesWatched":0,"status":0,"active":true,"days":[{"day":"Sin ver","order":1}]}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, writer),
		Now:    func() time.Time { return time.UnixMilli(1710000000456).UTC() },
	})

	if _, err := service.SetAnimeDays(ctx, anime.SetAnimeDaysCommand{
		AnimeID: "anime-1",
		Dias:    []string{"Ver hoy"},
		Base:    new(int64(1000)),
	}); err != nil {
		t.Fatalf("SetAnimeDays: %v", err)
	}

	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	days := value.Days
	if len(days) != 1 || days[0].Day != "Ver hoy" || days[0].Order != 1 {
		t.Fatalf("dias = %+v, want a single Ver hoy/1 entry", days)
	}
}

func TestEpisodeServiceSetAnimeStateWritesStateAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Frieren","episodesWatched":10,"status":0,"totalEpisodes":28,"active":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	activityRecorder := &stubEpisodeActivityRecorder{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activityRecorder,
		Now:      func() time.Time { return time.UnixMilli(1710000000456).UTC() },
	})

	result, err := service.SetAnimeState(ctx, anime.SetAnimeStateCommand{
		AnimeID: "anime-1",
		Estado:  3,
		Base:    new(int64(1000)),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("set anime state: %v", err)
	}
	if result.Estado != 3 {
		t.Fatalf("expected resulting state 3, got %d", result.Estado)
	}

	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if value.Status == nil || *value.Status != 3 {
		t.Fatalf("expected finalized snapshot state 3, got %#v", value.Status)
	}

	if len(activityRecorder.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activityRecorder.records))
	}
	record := activityRecorder.records[0]
	if record.ActionType != anime.ActivityActionAnimeStateSet {
		t.Fatalf("expected state-set activity, got %q", record.ActionType)
	}
	if record.Before.Estado != 0 || record.After.Estado != 3 {
		t.Fatalf("expected before/after state 0 -> 3, got %#v -> %#v", record.Before, record.After)
	}
}

func TestEpisodeServiceSoftDeleteAnimeWritesInactiveDeletionDateAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Frieren","episodesWatched":10,"status":0,"totalEpisodes":28,"active":true,"deletedAt":null}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	activityRecorder := &stubEpisodeActivityRecorder{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activityRecorder,
		Now:      func() time.Time { return time.UnixMilli(1710000000789).UTC() },
	})

	result, err := service.SoftDeleteAnime(ctx, anime.SoftDeleteAnimeCommand{
		AnimeID: "anime-1",
		Base:    new(int64(1000)),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("soft delete anime: %v", err)
	}
	if result.AnimeID != "anime-1" {
		t.Fatalf("expected anime-1 result, got %#v", result)
	}

	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if value.Active != domain.TriStateFalse {
		t.Fatalf("expected inactive domain state, got %v", value.Active)
	}
	deletedAt := value.DeletedAt
	if deletedAt == nil || deletedAt.UnixMilli() != 1710000000789 {
		t.Fatalf("expected fechaEliminacion stamp, got %v", deletedAt)
	}
	if value.LastWatchedAt != nil {
		t.Fatalf("expected soft delete not to stamp last watched time, got %v", value.LastWatchedAt)
	}

	if len(activityRecorder.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activityRecorder.records))
	}
	record := activityRecorder.records[0]
	if record.ActionType != anime.ActivityActionAnimeSoftDeleted {
		t.Fatalf("expected soft-delete activity, got %q", record.ActionType)
	}
	if record.Before.Activo != 1 || record.After.Activo != 0 {
		t.Fatalf("expected before/after activo 1 -> 0, got %#v -> %#v", record.Before, record.After)
	}
}

func TestEpisodeServiceListEpisodeScheduleFiltersActiveAnimeByDayOrder(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-late", `{"id":"anime-late","name":"Late","episodesWatched":1,"status":0,"active":true,"days":[{"day":"Viernes","order":3}]}`)
	seedAnimeSnapshot(t, store, "anime-early", `{"id":"anime-early","name":"Early","episodesWatched":2,"status":0,"active":true,"days":[{"day":"Viernes","order":1}]}`)
	seedAnimeSnapshot(t, store, "anime-other-day", `{"id":"anime-other-day","name":"Other","episodesWatched":3,"status":0,"active":true,"days":[{"day":"Jueves","order":1}]}`)
	seedAnimeSnapshot(t, store, "anime-inactive", `{"id":"anime-inactive","name":"Inactive","episodesWatched":4,"status":0,"active":false,"days":[{"day":"Viernes","order":0}]}`)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query: anime.NewQueryService(store),
	})

	got, err := service.ListEpisodeSchedule(ctx, anime.EpisodeScheduleQuery{Day: "Viernes"})
	if err != nil {
		t.Fatalf("list episode schedule: %v", err)
	}

	gotIDs := make([]string, 0, len(got))
	for _, item := range got {
		gotIDs = append(gotIDs, item.AnimeID)
	}
	wantIDs := []string{"anime-early", "anime-late"}
	if !reflect.DeepEqual(gotIDs, wantIDs) {
		t.Fatalf("expected ids %#v, got %#v", wantIDs, gotIDs)
	}
	if got[0].DayOrder != 1 || got[1].DayOrder != 3 {
		t.Fatalf("expected day orders [1 3], got [%d %d]", got[0].DayOrder, got[1].DayOrder)
	}
}

func TestEpisodeServiceListEpisodeScheduleExposesLiteralFolderPageAndHasCover(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-cover",
		`{"id":"anime-cover","name":"Cover","episodesWatched":1,"status":0,"active":true,`+
			`"days":[{"day":"Lunes","order":1}],"folder":"C:\\anime\\cover",`+
			`"sourceUrl":"https://example.com/watch",`+
			`"cover":{"type":"url","path":"https://cdn.jkdesu.com/x.jpg"}}`)
	seedAnimeSnapshot(t, store, "anime-empty",
		`{"id":"anime-empty","name":"Empty","episodesWatched":1,"status":0,"active":true,`+
			`"days":[{"day":"Lunes","order":2}]}`)
	seedAnimeSnapshot(t, store, "anime-null-portada",
		`{"id":"anime-null-portada","name":"NullPortada","episodesWatched":1,"status":0,"active":true,`+
			`"days":[{"day":"Lunes","order":3}],"cover":{"type":"image","path":"null"}}`)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListEpisodeSchedule(ctx, anime.EpisodeScheduleQuery{Day: "Lunes"})
	if err != nil {
		t.Fatalf("list episode schedule: %v", err)
	}

	byID := make(map[string]anime.EpisodeScheduleItem, len(got))
	for _, item := range got {
		byID[item.AnimeID] = item
	}

	withCover, ok := byID["anime-cover"]
	if !ok {
		t.Fatalf("expected anime-cover in result, got %#v", byID)
	}
	if withCover.FolderPath != `C:\anime\cover` {
		t.Fatalf("expected literal folder path, got %q", withCover.FolderPath)
	}
	if withCover.PageURL != "https://example.com/watch" {
		t.Fatalf("expected literal page url, got %q", withCover.PageURL)
	}
	if !withCover.HasCover {
		t.Fatal("expected hasCover true for a URL-shaped portada")
	}

	empty, ok := byID["anime-empty"]
	if !ok {
		t.Fatalf("expected anime-empty in result, got %#v", byID)
	}
	if empty.FolderPath != "" || empty.PageURL != "" {
		t.Fatalf("expected empty literal strings for absent folder/page, got %#v", empty)
	}
	if empty.HasCover {
		t.Fatal("expected hasCover false for absent portada")
	}

	nullPortada, ok := byID["anime-null-portada"]
	if !ok {
		t.Fatalf("expected anime-null-portada in result, got %#v", byID)
	}
	if nullPortada.HasCover {
		t.Fatal("expected hasCover false for the literal 'null' sentinel")
	}
}

type stubEpisodeActivityRecorder struct {
	records []anime.ActivityRecord
}

func (s *stubEpisodeActivityRecorder) RecordActivity(_ context.Context, record anime.ActivityRecord) error {
	s.records = append(s.records, record)
	return nil
}
