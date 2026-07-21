package anime_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestScheduleServiceApplyBreaksEqualLegacyOrdersDeterministicallyByAnimeID(t *testing.T) {
	ctx := context.Background()
	for iteration := 0; iteration < 40; iteration++ {
		env := newDeterministicScheduleTestEnv(t)
		result, err := env.service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 103, Entries: []anime.ApplyAnimeScheduleDraftEntry{{
			AnimeID:        "anime-c",
			BaseModifiedAt: 103,
			Placements:     []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 1}},
		}}})
		assertDeterministicScheduleResult(t, iteration, err, result)
		assertDeterministicSchedulePublishedEvent(t, iteration, env.publisher)
		assertDeterministicScheduleBoard(t, iteration, ctx, env.store)
		assertDeterministicLegacySnapshots(t, iteration, ctx, env.store)
	}
}

type deterministicScheduleTestEnv struct {
	store     *bridgeSync.AnimeSnapshotStore
	service   *anime.ScheduleService
	publisher *editorRecordingPublisher
}

// newDeterministicScheduleTestEnv builds the deterministic schedule fixture.
func newDeterministicScheduleTestEnv(t *testing.T) deterministicScheduleTestEnv {
	t.Helper()
	store := openAnimeServiceTestStore(t)
	payloads := []string{
		`{"_id":"anime-b","nombre":"Anime B","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`,
		`{"_id":"anime-a","nombre":"Anime A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`,
		`{"_id":"anime-c","nombre":"Anime C","activo":true,"dias":[{"dia":"Sin ver","orden":1}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}
	publisher := &editorRecordingPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), &stubAnimeWriter{})
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	return deterministicScheduleTestEnv{store: store, service: service, publisher: publisher}
}

// assertDeterministicScheduleResult verifies one deterministic apply result.
func assertDeterministicScheduleResult(t *testing.T, iteration int, err error, result anime.PatchResult) {
	t.Helper()
	if err != nil {
		t.Fatalf("iteration %d apply deterministic tie-break draft: %v", iteration, err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("iteration %d expected applied outcome, got %+v", iteration, result)
	}
}

// assertDeterministicSchedulePublishedEvent verifies the published event.
func assertDeterministicSchedulePublishedEvent(t *testing.T, iteration int, publisher *editorRecordingPublisher) {
	t.Helper()
	if got := len(publisher.events()); got != 1 {
		t.Fatalf("iteration %d expected exactly one publication for the changed anime, got %d", iteration, got)
	}
	assertSchedulePublishedAnimeChanged(t, publisher.events()[0], "anime-c", `{"_id":"anime-c","nombre":"Anime C","nrocapvisto":0,"activo":true,"dias":[{"dia":"Visto","orden":1}]}`)
}

// assertDeterministicScheduleBoard verifies the projected schedule board.
func assertDeterministicScheduleBoard(t *testing.T, iteration int, ctx context.Context, store *bridgeSync.AnimeSnapshotStore) {
	t.Helper()
	board, err := anime.NewScheduleQueryService(anime.NewQueryService(store)).GetEditorBoard(ctx, anime.GetAnimeEditorScheduleBoardQuery{})
	if err != nil {
		t.Fatalf("iteration %d query normalized editor board: %v", iteration, err)
	}
	boardPlacements := map[string][]contracts.MobileAnimeDay{}
	for _, entry := range board.Entries {
		boardPlacements[entry.AnimeID] = append([]contracts.MobileAnimeDay(nil), entry.Placements...)
	}
	assertEditorBoardPlacement(t, iteration, boardPlacements["anime-a"], "anime-a", "Lunes", 1)
	assertEditorBoardPlacement(t, iteration, boardPlacements["anime-b"], "anime-b", "Lunes", 2)
}

// assertDeterministicLegacySnapshots verifies persisted schedule snapshots.
func assertDeterministicLegacySnapshots(t *testing.T, iteration int, ctx context.Context, store *bridgeSync.AnimeSnapshotStore) {
	t.Helper()
	animeA, err := store.GetSnapshot(ctx, "anime-a")
	if err != nil {
		t.Fatalf("iteration %d get anime-a snapshot: %v", iteration, err)
	}
	animeB, err := store.GetSnapshot(ctx, "anime-b")
	if err != nil {
		t.Fatalf("iteration %d get anime-b snapshot: %v", iteration, err)
	}
	assertLegacySchedulePlacement(t, iteration, animeA.CanonicalJSON, "anime-a", "Lunes", 1)
	assertLegacySchedulePlacement(t, iteration, animeB.CanonicalJSON, "anime-b", "Lunes", 1)
}

// assertEditorBoardPlacement verifies one editor board placement.
func assertEditorBoardPlacement(t *testing.T, iteration int, got []contracts.MobileAnimeDay, animeID string, wantDay string, wantOrder int) {
	t.Helper()
	if len(got) != 1 || got[0].Dia != wantDay || got[0].Orden != wantOrder {
		t.Fatalf("iteration %d expected %s at %s#%d, got %+v", iteration, animeID, wantDay, wantOrder, got)
	}
}

// assertLegacySchedulePlacement verifies one legacy schedule placement.
func assertLegacySchedulePlacement(t *testing.T, iteration int, payload []byte, animeID string, wantDay string, wantOrder float64) {
	t.Helper()
	got := decodeSchedulePayloadDays(t, payload)
	if len(got) != 1 || got[0].Dia != wantDay || got[0].Orden != wantOrder {
		t.Fatalf("iteration %d expected %s at %s#%.0f, got %+v", iteration, animeID, wantDay, wantOrder, got)
	}
}
