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
		`{"id":"anime-1","name":"Frieren","episodesWatched":10,"status":0,"totalEpisodes":28,"active":false,"deletedAt":1700000000000}`,
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
		Base:    new(int64(1000)),
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		t.Fatalf("restore anime: %v", err)
	}
	if result.AnimeID != "anime-1" || result.Outcome != anime.PatchOutcomeApplied || result.ModifiedAt <= 1000 || result.ConflictID != "" {
		t.Fatalf("restore result did not preserve the authoritative patch outcome: %#v", result)
	}

	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	value := decodeAnimeDomain(t, snapshot.CanonicalJSON)
	if value.Active != domain.TriStateTrue {
		t.Fatalf("expected active domain state, got %v", value.Active)
	}
	fields := decodeJSONFields(t, snapshot.CanonicalJSON)
	if string(fields["deletedAt"]) != "null" {
		t.Fatalf("expected deletedAt null, got %s", fields["deletedAt"])
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
		`{"id":"anime-1","name":"Frieren","episodesWatched":10.5,"status":1,"totalEpisodes":28,"active":false,"firstCycle":true,"sourceUrl":"https://pixeldrain.net/l/qyupHs6T","folder":"D:/Anime/Frieren","createdAt":1600000000000,"premieredAt":1600000100000,"lastWatchedAt":1600000200000,"deletedAt":1600000300000,"repetitions":[{"numRepetitions":0,"episodesWatched":8,"status":1,"repeatedAt":1500000000000}]}`,
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
		Base:    new(int64(1000)),
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

	snapshot, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	payload := decodeRawJSONMap(t, snapshot.CanonicalJSON)
	assertRepeatPayloadReset(t, payload)
	assertRepeatedCycleSnapshot(t, payload)
	if payload["sourceUrl"] != "https://pixeldrain.net/l/qyupHs6T" || payload["folder"] != "D:/Anime/Frieren" {
		t.Fatalf("repeat must preserve source and folder, got source=%v folder=%v", payload["sourceUrl"], payload["folder"])
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
	if payload["episodesWatched"] != float64(0) || payload["status"] != float64(0) || payload["active"] != true || payload["firstCycle"] != false {
		t.Fatalf("expected reset progress/state/active/firstCycle, got %#v", payload)
	}
	if payload["premieredAt"] != nil || payload["lastWatchedAt"] != nil || payload["deletedAt"] != nil {
		t.Fatalf("expected repeat to clear watch/deletion dates, got %#v", payload)
	}
	createdAt, ok := payload["createdAt"].(float64)
	if !ok || createdAt != float64(1710000001111) {
		t.Fatalf("expected new createdAt stamp, got %#v", payload["createdAt"])
	}
}

// assertRepeatedCycleSnapshot verifies the stored repeated-cycle snapshot.
func assertRepeatedCycleSnapshot(t *testing.T, payload map[string]any) {
	t.Helper()
	repeats, ok := payload["repetitions"].([]any)
	if !ok || len(repeats) != 2 {
		t.Fatalf("expected two repeat entries, got %#v", payload["repetitions"])
	}
	nextRepeat, ok := repeats[1].(map[string]any)
	if !ok {
		t.Fatalf("expected repeat entry object, got %#v", repeats[1])
	}
	if nextRepeat["numRepetitions"] != float64(1) || nextRepeat["episodesWatched"] != 10.5 || nextRepeat["status"] != float64(1) {
		t.Fatalf("expected current cycle snapshot in repeat entry, got %#v", nextRepeat)
	}
}
