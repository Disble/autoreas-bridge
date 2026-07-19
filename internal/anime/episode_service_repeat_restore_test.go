package anime_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
)

func TestEpisodeServiceRestoreAnimeWritesActiveAndClearsDeletionDate(t *testing.T) {
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
	activity := &stubEpisodeActivityRecorder{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:    anime.NewQueryService(store),
		Writer:   writeService,
		Activity: activity,
		Now:      func() time.Time { return time.UnixMilli(1710000000999).UTC() },
	})

	result, err := service.RestoreAnime(ctx, anime.RestoreAnimeCommand{
		AnimeID: "anime-1",
		Base:    int64Ptr(1000),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("restore anime: %v", err)
	}
	if result.AnimeID != "anime-1" || result.Outcome != anime.PatchOutcomeApplied || result.ModifiedAt <= 1000 || result.ConflictID != "" {
		t.Fatalf("restore result did not preserve the authoritative patch outcome: %#v", result)
	}

	value := decodeAnimeDomain(t, writer.payload)
	if value.Active != domain.TriStateTrue {
		t.Fatalf("expected active domain state, got %v", value.Active)
	}
	fields := decodeJSONFields(t, writer.payload)
	if string(fields["fechaEliminacion"]) != "null" {
		t.Fatalf("expected fechaEliminacion null, got %s", fields["fechaEliminacion"])
	}
	if value.LastWatchedAt != nil {
		t.Fatalf("expected restore not to stamp last watched time, got %v", value.LastWatchedAt)
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

func TestEpisodeServiceRepeatAnimeSnapshotsCurrentCycleAndResetsState(t *testing.T) {
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
	activity := &stubEpisodeActivityRecorder{}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
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
	if result.AnimeID != "anime-1" || result.Outcome != anime.PatchOutcomeApplied || result.ModifiedAt <= 1000 || result.ConflictID != "" {
		t.Fatalf("repeat result did not preserve the authoritative patch outcome: %#v", result)
	}

	payload := decodeRawJSONMap(t, writer.payload)
	assertRepeatPayloadReset(t, payload)
	assertRepeatedCycleSnapshot(t, payload)

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

// decodeRawJSONMap decodes a payload for repeat assertions.
func decodeRawJSONMap(t *testing.T, payload []byte) map[string]any {
	t.Helper()
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	return decoded
}

// assertRepeatPayloadReset verifies that repeat resets progress fields.
func assertRepeatPayloadReset(t *testing.T, payload map[string]any) {
	t.Helper()
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
}

// assertRepeatedCycleSnapshot verifies the stored repeated-cycle snapshot.
func assertRepeatedCycleSnapshot(t *testing.T, payload map[string]any) {
	t.Helper()
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
}
