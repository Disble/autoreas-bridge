package anime_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
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

// TestEpisodeServiceRepeatAnimeRecordsCycleResetAndLeavesWatchHistoryUnchanged
// asserts design.md D3: a repeat's CycleReset records nothing and retracts
// nothing. A real watchhistory.Store (not a stub) proves the "leaves it
// unchanged" half, since Derive's guard 1 is exactly what makes it a no-op
// regardless of the Change's other fields; watchStoreRecorder additionally
// captures the raw Change so the literal cycle/before/after values passed to
// RecordWatch are pinned too, not just the store's net effect.
func TestEpisodeServiceRepeatAnimeRecordsCycleResetAndLeavesWatchHistoryUnchanged(t *testing.T) {
	ctx := context.Background()
	db := openAnimeServiceTestDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedAnimeSnapshotWithModifiedAt(
		t,
		store,
		"anime-1",
		`{"id":"anime-1","name":"Frieren","episodesWatched":10.5,"status":1,"active":false,"repetitions":[{"numRepetitions":0,"episodesWatched":8,"status":1,"repeatedAt":1500000000000}]}`,
		1000,
	)

	// anime-1 already carries one repetition, so the closing cycle (the one
	// this repeat resets) is cycle 2 -- len(Repetitions)+1. Seed a row on
	// that exact cycle so a broken CycleReset guard would be observable.
	watchStore := watchhistory.NewStore(db)
	if err := watchStore.Apply(ctx, watchhistory.Change{
		AnimeID: "anime-1", AnimeName: "Frieren", Source: anime.ActivitySourceDesktop,
		OccurredAtMS: 1650000000000, BeforeEpisodes: 9, AfterEpisodes: 10, Cycle: 2,
	}); err != nil {
		t.Fatalf("seed watch history row: %v", err)
	}

	watchRecorder := &watchStoreRecorder{store: watchStore}
	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{
		Query:  anime.NewQueryService(store),
		Writer: anime.NewWriteService(store, &stubAnimeWriter{}),
		Watch:  watchRecorder,
		Now:    func() time.Time { return time.UnixMilli(1710000001111).UTC() },
	})

	if _, err := service.RepeatAnime(ctx, anime.RepeatAnimeCommand{AnimeID: "anime-1", Base: new(int64(1000))}); err != nil {
		t.Fatalf("repeat anime: %v", err)
	}

	page, err := watchStore.Page(ctx, watchhistory.PageQuery{})
	if err != nil {
		t.Fatalf("page watch history: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].Episode != 10 || page.Items[0].Cycle != 2 {
		t.Fatalf("expected a repeat to record zero inserts and zero deletions, got %#v", page.Items)
	}
	if len(watchRecorder.calls) != 1 {
		t.Fatalf("expected 1 watch history call, got %d", len(watchRecorder.calls))
	}
	change := watchRecorder.calls[0]
	if !change.CycleReset || change.Cycle != 2 || change.BeforeEpisodes != 10.5 || change.AfterEpisodes != 0 {
		t.Fatalf("unexpected watch history change: %#v", change)
	}
}

// watchStoreRecorder adapts a real watchhistory.Store to anime.WatchRecorder
// while also recording every call, so a test can assert both the raw Change
// fields RecordWatch received AND the real Derive/Apply outcome a stub alone
// cannot prove.
type watchStoreRecorder struct {
	store *watchhistory.Store
	calls []watchhistory.Change
}

func (r *watchStoreRecorder) RecordWatch(ctx context.Context, change watchhistory.Change) error {
	r.calls = append(r.calls, change)
	return r.store.Apply(ctx, change)
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
