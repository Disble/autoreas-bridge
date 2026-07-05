package anime_test

import (
	"context"
	"encoding/json"
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

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.NroCapVisto != 3 {
		t.Fatalf("expected writer payload progress 3, got %v", raw.NroCapVisto)
	}
	lastWatched := raw.FechaUltCapVisto.Time()
	if lastWatched == nil || lastWatched.UnixMilli() != 1710000000123 {
		t.Fatalf("expected fechaUltCapVisto to be stamped, got %v", lastWatched)
	}
	firstWatched := raw.FechaEstreno.Time()
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

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.EstadoValue() == nil || *raw.EstadoValue() != 3 {
		t.Fatalf("expected writer payload state 3, got %#v", raw.EstadoValue())
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

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.Activo.TriState() != domain.TriStateFalse {
		t.Fatalf("expected activo false, got %v", raw.Activo.TriState())
	}
	deletedAt := raw.FechaEliminacion.Time()
	if deletedAt == nil || deletedAt.UnixMilli() != 1710000000789 {
		t.Fatalf("expected fechaEliminacion stamp, got %v", deletedAt)
	}
	if raw.FechaUltCapVisto.Time() != nil {
		t.Fatalf("expected soft delete not to stamp fechaUltCapVisto, got %v", raw.FechaUltCapVisto.Time())
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

func TestChapterServiceRestoreAnimeWritesActiveAndClearsDeletionDate(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Frieren","nrocapvisto":10,"estado":0,"totalcap":28,"activo":false,"fechaEliminacion":{"$$date":1700000000000}}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	activity := &stubChapterActivityRecorder{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activity,
		Now:      func() time.Time { return time.UnixMilli(1710000000999).UTC() },
	})

	_, err := service.RestoreAnime(ctx, anime.RestoreAnimeCommand{
		AnimeID: "anime-1",
		Base:    int64Ptr(1000),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("restore anime: %v", err)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.Activo.TriState() != domain.TriStateTrue {
		t.Fatalf("expected activo true, got %v", raw.Activo.TriState())
	}
	if !raw.FechaEliminacion.IsNull() {
		t.Fatalf("expected fechaEliminacion null, got %#v", raw.FechaEliminacion)
	}
	if raw.FechaUltCapVisto.Time() != nil {
		t.Fatalf("expected restore not to stamp fechaUltCapVisto, got %v", raw.FechaUltCapVisto.Time())
	}

	if len(activity.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activity.records))
	}
	record := activity.records[0]
	if record.ActionType != anime.ActivityActionAnimeRestored {
		t.Fatalf("expected restore activity, got %q", record.ActionType)
	}
	if record.Before.Activo != 0 || record.After.Activo != 1 {
		t.Fatalf("expected before/after activo 0 -> 1, got %#v -> %#v", record.Before, record.After)
	}
}

func TestChapterServiceRepeatAnimeSnapshotsCurrentCycleAndResetsState(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"_id":"anime-1","nombre":"Frieren","nrocapvisto":10.5,"estado":1,"totalcap":28,"activo":false,"primeravez":true,"fechaCreacion":{"$$date":1600000000000},"fechaEstreno":{"$$date":1600000100000},"fechaUltCapVisto":{"$$date":1600000200000},"fechaEliminacion":{"$$date":1600000300000},"repetir":[{"numrepeticion":0,"nrocapvisto":8,"estado":1,"fechaRepeticion":{"$$date":1500000000000}}]}`,
		1000,
	)

	writer := &stubAnimeWriter{}
	writeService := anime.NewWriteService(store, writer)
	activity := &stubChapterActivityRecorder{}
	service := anime.NewChapterService(anime.ChapterServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activity,
		Now:      func() time.Time { return time.UnixMilli(1710000001111).UTC() },
	})

	result, err := service.RepeatAnime(ctx, anime.RepeatAnimeCommand{
		AnimeID: "anime-1",
		Base:    int64Ptr(1000),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("repeat anime: %v", err)
	}
	if result.Estado != 0 || result.NroCapVisto != 0 {
		t.Fatalf("expected reset result, got %#v", result)
	}

	var payload map[string]any
	if err := json.Unmarshal(writer.payload, &payload); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if payload["nrocapvisto"] != float64(0) || payload["estado"] != float64(0) || payload["activo"] != true || payload["primeravez"] != false {
		t.Fatalf("expected reset progress/state/active/primeravez, got %#v", payload)
	}
	if payload["fechaEstreno"] != nil || payload["fechaUltCapVisto"] != nil || payload["fechaEliminacion"] != nil {
		t.Fatalf("expected repeat to clear watch/deletion dates, got %#v", payload)
	}
	createdAt, ok := payload["fechaCreacion"].(map[string]any)
	if !ok || createdAt["$$date"] != float64(1710000001111) {
		t.Fatalf("expected new fechaCreacion stamp, got %#v", payload["fechaCreacion"])
	}
	repeats, ok := payload["repetir"].([]any)
	if !ok || len(repeats) != 2 {
		t.Fatalf("expected two repeat entries, got %#v", payload["repetir"])
	}
	nextRepeat, ok := repeats[1].(map[string]any)
	if !ok {
		t.Fatalf("expected repeat entry object, got %#v", repeats[1])
	}
	if nextRepeat["numrepeticion"] != float64(1) || nextRepeat["nrocapvisto"] != 10.5 || nextRepeat["estado"] != float64(1) {
		t.Fatalf("expected current cycle snapshot in repeat entry, got %#v", nextRepeat)
	}

	if len(activity.records) != 1 {
		t.Fatalf("expected 1 activity record, got %d", len(activity.records))
	}
	record := activity.records[0]
	if record.ActionType != anime.ActivityActionAnimeRepeated {
		t.Fatalf("expected repeat activity, got %q", record.ActionType)
	}
	if record.Before.NroCapVisto != 10.5 || record.Before.Estado != 1 || record.Before.Activo != 0 {
		t.Fatalf("expected before snapshot from current cycle, got %#v", record.Before)
	}
	if record.After.NroCapVisto != 0 || record.After.Estado != 0 || record.After.Activo != 1 {
		t.Fatalf("expected after snapshot reset, got %#v", record.After)
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
