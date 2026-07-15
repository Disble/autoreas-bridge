package anime_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
)

func TestChapterServiceAdjustWatchedChaptersWritesProgressAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Dungeon Meshi","nrocapvisto":2.5,"estado":0,"totalcap":24,"activo":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	activity := &stubChapterActivityRecorder{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activity,
		Now:      func() time.Time { return time.UnixMilli(1710000000123).UTC() },
	})

	result, err := service.AdjustWatchedChapters(ctx, anime.AdjustWatchedChaptersCommand{
		AnimeID: "anime-1",
		Delta:   0.5,
		Base:    int64Ptr(1000),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("adjust watched chapters: %v", err)
	}

	if result.NroCapVisto != 3 {
		t.Fatalf("expected resulting progress 3, got %v", result.NroCapVisto)
	}

	value := decodeAnimeDomain(t, writer.payload)
	if value.Progress != 3 {
		t.Fatalf("expected writer payload progress 3, got %v", value.Progress)
	}
	lastWatched := value.LastWatchedAt
	if lastWatched == nil || lastWatched.UnixMilli() != 1710000000123 {
		t.Fatalf("expected fechaUltCapVisto to be stamped, got %v", lastWatched)
	}
	firstWatched := value.PremieredAt
	if firstWatched == nil || firstWatched.UnixMilli() != 1710000000123 {
		t.Fatalf("expected fechaEstreno to be stamped on first watch, got %v", firstWatched)
	}

	if len(activity.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activity.records))
	}
	record := activity.records[0]
	if record.ActionType != anime.ActivityActionChapterAdjusted {
		t.Fatalf("expected chapter adjusted activity, got %q", record.ActionType)
	}
	if record.AnimeID != "anime-1" || record.AnimeName != "Dungeon Meshi" {
		t.Fatalf("expected anime identity to be recorded, got %#v", record)
	}
	if record.Source != anime.ActivitySourceDesktop {
		t.Fatalf("expected desktop source, got %q", record.Source)
	}
	if record.Before.NroCapVisto != 2.5 || record.After.NroCapVisto != 3 {
		t.Fatalf("expected before/after progress 2.5 -> 3, got %#v -> %#v", record.Before, record.After)
	}
}

func TestChapterServiceAdjustWatchedChaptersRejectsBlockedStates(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Paused","nrocapvisto":4,"estado":3,"totalcap":12,"activo":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, writer),
	})

	_, err := service.AdjustWatchedChapters(ctx, anime.AdjustWatchedChaptersCommand{
		AnimeID: "anime-1",
		Delta:   1,
		Base:    int64Ptr(1000),
	})
	if !errors.Is(err, anime.ErrChapterProgressBlocked) {
		t.Fatalf("expected blocked progress error, got %v", err)
	}
	if writer.payload != nil {
		t.Fatalf("expected no writer payload for blocked state, got %s", writer.payload)
	}
}

func TestChapterServiceAdjustWatchedChaptersRejectsNegativeProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Start","nrocapvisto":0,"estado":0,"totalcap":12,"activo":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, writer),
	})

	_, err := service.AdjustWatchedChapters(ctx, anime.AdjustWatchedChaptersCommand{
		AnimeID: "anime-1",
		Delta:   -0.5,
		Base:    int64Ptr(1000),
	})
	if !errors.Is(err, anime.ErrChapterProgressBelowZero) {
		t.Fatalf("expected below-zero progress error, got %v", err)
	}
	if writer.payload != nil {
		t.Fatalf("expected no writer payload for negative progress, got %s", writer.payload)
	}
}

func TestChapterServiceSetAnimeDaysWritesDias(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Frieren","nrocapvisto":0,"estado":0,"activo":true,"dias":[{"dia":"Sin ver","orden":1}]}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, writer),
		Now:    func() time.Time { return time.UnixMilli(1710000000456).UTC() },
	})

	if _, err := service.SetAnimeDays(ctx, anime.SetAnimeDaysCommand{
		AnimeID: "anime-1",
		Dias:    []string{"Ver hoy"},
		Base:    int64Ptr(1000),
	}); err != nil {
		t.Fatalf("SetAnimeDays: %v", err)
	}

	value := decodeAnimeDomain(t, writer.payload)
	days := value.Days
	if len(days) != 1 || days[0].Day != "Ver hoy" || days[0].Order != 1 {
		t.Fatalf("dias = %+v, want a single Ver hoy/1 entry", days)
	}
}

func TestChapterServiceSetAnimeStateWritesStateAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Frieren","nrocapvisto":10,"estado":0,"totalcap":28,"activo":true}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	activity := &stubChapterActivityRecorder{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activity,
		Now:      func() time.Time { return time.UnixMilli(1710000000456).UTC() },
	})

	result, err := service.SetAnimeState(ctx, anime.SetAnimeStateCommand{
		AnimeID: "anime-1",
		Estado:  3,
		Base:    int64Ptr(1000),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("set anime state: %v", err)
	}
	if result.Estado != 3 {
		t.Fatalf("expected resulting state 3, got %d", result.Estado)
	}

	value := decodeAnimeDomain(t, writer.payload)
	if value.Status == nil || *value.Status != 3 {
		t.Fatalf("expected writer payload state 3, got %#v", value.Status)
	}

	if len(activity.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activity.records))
	}
	record := activity.records[0]
	if record.ActionType != anime.ActivityActionAnimeStateSet {
		t.Fatalf("expected state-set activity, got %q", record.ActionType)
	}
	if record.Before.Estado != 0 || record.After.Estado != 3 {
		t.Fatalf("expected before/after state 0 -> 3, got %#v -> %#v", record.Before, record.After)
	}
}

func TestChapterServiceSoftDeleteAnimeWritesInactiveDeletionDateAndRecordsActivity(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Frieren","nrocapvisto":10,"estado":0,"totalcap":28,"activo":true,"fechaEliminacion":null}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	activity := &stubChapterActivityRecorder{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activity,
		Now:      func() time.Time { return time.UnixMilli(1710000000789).UTC() },
	})

	result, err := service.SoftDeleteAnime(ctx, anime.SoftDeleteAnimeCommand{
		AnimeID: "anime-1",
		Base:    int64Ptr(1000),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("soft delete anime: %v", err)
	}
	if result.AnimeID != "anime-1" {
		t.Fatalf("expected anime-1 result, got %#v", result)
	}

	value := decodeAnimeDomain(t, writer.payload)
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

	if len(activity.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activity.records))
	}
	record := activity.records[0]
	if record.ActionType != anime.ActivityActionAnimeSoftDeleted {
		t.Fatalf("expected soft-delete activity, got %q", record.ActionType)
	}
	if record.Before.Activo != 1 || record.After.Activo != 0 {
		t.Fatalf("expected before/after activo 1 -> 0, got %#v -> %#v", record.Before, record.After)
	}
}

func TestChapterServiceListChapterScheduleFiltersActiveAnimeByDayOrder(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-late", `{"_id":"anime-late","nombre":"Late","nrocapvisto":1,"estado":0,"activo":true,"dias":[{"dia":"Viernes","orden":3}]}`)
	seedAnimeSnapshot(t, store, "anime-early", `{"_id":"anime-early","nombre":"Early","nrocapvisto":2,"estado":0,"activo":true,"dias":[{"dia":"Viernes","orden":1}]}`)
	seedAnimeSnapshot(t, store, "anime-other-day", `{"_id":"anime-other-day","nombre":"Other","nrocapvisto":3,"estado":0,"activo":true,"dias":[{"dia":"Jueves","orden":1}]}`)
	seedAnimeSnapshot(t, store, "anime-inactive", `{"_id":"anime-inactive","nombre":"Inactive","nrocapvisto":4,"estado":0,"activo":false,"dias":[{"dia":"Viernes","orden":0}]}`)

	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query: anime.NewQueryService(store),
	})

	got, err := service.ListChapterSchedule(ctx, anime.ChapterScheduleQuery{Day: "Viernes"})
	if err != nil {
		t.Fatalf("list chapter schedule: %v", err)
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

func TestChapterServiceListChapterScheduleExposesLiteralFolderPageAndHasCover(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-cover",
		`{"_id":"anime-cover","nombre":"Cover","nrocapvisto":1,"estado":0,"activo":true,`+
			`"dias":[{"dia":"Lunes","orden":1}],"carpeta":"C:\\anime\\cover",`+
			`"pagina":"https://example.com/watch",`+
			`"portada":{"type":"url","path":"https://cdn.jkdesu.com/x.jpg"}}`)
	seedAnimeSnapshot(t, store, "anime-empty",
		`{"_id":"anime-empty","nombre":"Empty","nrocapvisto":1,"estado":0,"activo":true,`+
			`"dias":[{"dia":"Lunes","orden":2}]}`)
	seedAnimeSnapshot(t, store, "anime-null-portada",
		`{"_id":"anime-null-portada","nombre":"NullPortada","nrocapvisto":1,"estado":0,"activo":true,`+
			`"dias":[{"dia":"Lunes","orden":3}],"portada":{"type":"image","path":"null"}}`)

	service := anime.NewChapterService(anime.ChapterServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListChapterSchedule(ctx, anime.ChapterScheduleQuery{Day: "Lunes"})
	if err != nil {
		t.Fatalf("list chapter schedule: %v", err)
	}

	byID := make(map[string]anime.ChapterScheduleItem, len(got))
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

type stubChapterActivityRecorder struct {
	records []anime.ActivityRecord
}

func (s *stubChapterActivityRecorder) RecordActivity(_ context.Context, record anime.ActivityRecord) error {
	s.records = append(s.records, record)
	return nil
}
