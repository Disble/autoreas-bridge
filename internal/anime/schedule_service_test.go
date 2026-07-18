package anime_test

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestScheduleServiceRejectsWholeDraftWhenAnyBaseIsStale(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`, 202)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 201, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply stale schedule draft: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeConflict {
		t.Fatalf("expected whole-draft conflict, got %+v", result)
	}
	if writer.calls != 0 {
		t.Fatalf("expected zero writes for stale draft, got %d", writer.calls)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict for stale draft, got %d", len(conflicts.inserted))
	}
}

func TestScheduleServiceRejectsWholeDraftWhenUnchangedBoardMemberAdvances(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 203)

	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	conflicts := &stubConflictWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
	}})
	if err != nil {
		t.Fatalf("unexpected schedule apply error: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeConflict {
		t.Fatalf("expected whole-board OCC rejection when another board member advanced, got %+v", result)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict for board-wide OCC rejection, got %d", len(conflicts.inserted))
	}
}

func TestScheduleServiceApplyDoesNotPartiallyWriteWhenBatchReplacementFails(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 202)

	// failingSecondWriteAnimeWriter implements batchReplaceWriter, so the
	// ScheduleService gateway delegates ReplaceFile to it instead of running
	// the default file-mutation coordinator. On first call the injected
	// ReplaceFile returns an error, simulating a batch replacement failure
	// before any append or finalize occurs. The batch path stages operations
	// atomically via ApplyBatch and releases echo state on both definite and
	// ambiguous errors, so a failure at the ReplaceFile seam leaves the
	// canonical file and store untouched. This is a delegate seam, not the
	// production writer, because the production path would perform an actual
	// filesystem replacement; the atomicity invariant under failure is the
	// same either way.
	writer := &failingSecondWriteAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	_, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 202, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}}},
	}})
	if err == nil {
		t.Fatal("expected batch replacement failure to surface")
	}
	first, err := store.GetSnapshot(ctx, "anime-a")
	if err != nil {
		t.Fatalf("get first snapshot: %v", err)
	}
	second, err := store.GetSnapshot(ctx, "anime-b")
	if err != nil {
		t.Fatalf("get second snapshot: %v", err)
	}
	if string(first.CanonicalJSON) != `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}` || string(second.CanonicalJSON) != `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}` {
		t.Fatalf("schedule apply must be fully atomic, got first=%s second=%s", first.CanonicalJSON, second.CanonicalJSON)
	}
}

func TestScheduleServiceApplyAcceptsValidPartialDraftIntoPopulatedWeekday(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Viernes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)

	publisher := &editorRecordingPublisher{}
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	// anime-a is UNCHANGED at Lunes#1. Only anime-b is submitted, moved from
	// Viernes#1 to Lunes#2. The effective Lunes ordering is [1, 2] -- contiguous
	// -- so the draft is valid even though only the changed anime is in the draft.
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-b", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Dia: "Lunes", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply valid partial draft: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("expected applied outcome for valid partial draft, got %+v", result)
	}
	if len(publisher.events()) != 1 {
		t.Fatalf("expected one publication for one changed anime, got %d", len(publisher.events()))
	}
}

func TestScheduleServiceApplyTwoAnimeDraftProducesAppliedOutcomeAndExactPublications(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)

	publisher := &editorRecordingPublisher{}
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply two-anime schedule draft: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("expected applied outcome, got %+v", result)
	}
	if result.ModifiedAt <= 0 {
		t.Fatalf("expected positive refreshed board modified_at, got %d", result.ModifiedAt)
	}
	if len(publisher.events()) != 2 {
		t.Fatalf("expected exactly two publications (one per changed anime), got %d", len(publisher.events()))
	}
	afterRecords, err := anime.NewQueryService(store).ListReadRecords(ctx)
	if err != nil {
		t.Fatalf("query refreshed board after apply: %v", err)
	}
	if len(afterRecords) != 2 {
		t.Fatalf("expected refreshed board with two records, got %d", len(afterRecords))
	}
}

func TestScheduleServiceApplyAcceptsTopInsertedSpecialQueueDraftWithUntouchedSparseSunday(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloads := []string{
		`{"_id":"sayonara-lara","nombre":"Sayonara Lara","activo":true,"dias":[{"dia":"Sin ver","orden":1}]}`,
		`{"_id":"yani-neko","nombre":"Yani Neko","activo":true,"dias":[{"dia":"Sin ver","orden":2}]}`,
		`{"_id":"youjo-senki-ii","nombre":"Youjo Senki II","activo":true,"dias":[{"dia":"Sin ver","orden":3}]}`,
		`{"_id":"bang-dream","nombre":"BanG Dream! YumemoMita","activo":true,"dias":[{"dia":"Sin ver","orden":4}]}`,
		`{"_id":"futsutsuka","nombre":"Futsutsuka...","activo":true,"dias":[{"dia":"Visto","orden":1}]}`,
		`{"_id":"iwamoto","nombre":"Iwamoto...","activo":true,"dias":[{"dia":"Visto","orden":2}]}`,
		`{"_id":"tai-ari","nombre":"Tai-Ari...","activo":true,"dias":[{"dia":"Visto","orden":3}]}`,
		`{"_id":"tenmaku","nombre":"Tenmaku...","activo":true,"dias":[{"dia":"Visto","orden":4}]}`,
		`{"_id":"domingo-legacy","nombre":"Sunday Legacy","activo":true,"dias":[{"dia":"Domingo","orden":2}]}`,
		`{"_id":"legacy-unsupported","nombre":"Legacy Unsupported","activo":true,"dias":[{"dia":"Especial legado","orden":9}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}

	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloads...)}
	publisher := &editorRecordingPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 110, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "bang-dream", BaseModifiedAt: 104, Placements: []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 1}}},
		{AnimeID: "sayonara-lara", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 3}}},
		{AnimeID: "yani-neko", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply special-queue-only schedule draft: %v", err)
	}
	assertSpecialQueueDraftResult(t, ctx, store, publisher, result)
}

// assertSpecialQueueDraftResult verifies the special-queue schedule result.
func assertSpecialQueueDraftResult(t *testing.T, ctx context.Context, store *bridgeSync.AnimeSnapshotStore, publisher *editorRecordingPublisher, result anime.PatchResult) {
	t.Helper()
	if result.Outcome != anime.PatchOutcomeApplied || len(publisher.events()) != 8 {
		t.Fatalf("unexpected special queue result: %+v", result)
	}
	assertSchedulePublishedAnimeChanged(t, publisher.events()[0], "bang-dream", `{"_id":"bang-dream","nombre":"BanG Dream! YumemoMita","nrocapvisto":0,"activo":true,"dias":[{"dia":"Visto","orden":1}]}`)
	for _, test := range []struct {
		id, day string
		order   float64
	}{{"domingo-legacy", "Domingo", 2}, {"legacy-unsupported", "Especial legado", 9}, {"bang-dream", "Visto", 1}} {
		snapshot, err := store.GetSnapshot(ctx, test.id)
		if err != nil {
			t.Fatal(err)
		}
		days := decodeSchedulePayloadDays(t, snapshot.CanonicalJSON)
		if len(days) != 1 || days[0].Dia != test.day || days[0].Orden != test.order {
			t.Fatalf("unexpected %s days: %+v", test.id, days)
		}
	}
}

func TestScheduleServiceApplyReordersEveryCardAfterAnInColumnMove(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloads := []string{
		`{"_id":"iwamoto","nombre":"Iwamoto...","activo":true,"dias":[{"dia":"Visto","orden":1}]}`,
		`{"_id":"tai-ari","nombre":"Tai-Ari...","activo":true,"dias":[{"dia":"Visto","orden":2}]}`,
		`{"_id":"tenmaku","nombre":"Tenmaku...","activo":true,"dias":[{"dia":"Visto","orden":3}]}`,
		`{"_id":"futsutsuka","nombre":"Futsutsuka...","activo":true,"dias":[{"dia":"Visto","orden":4}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}

	publisher := &editorRecordingPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), &stubAnimeWriter{path: writeLegacyDataFile(t, payloads...)})
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 104, Entries: []anime.ApplyAnimeScheduleDraftEntry{{
		AnimeID:        "futsutsuka",
		BaseModifiedAt: 104,
		Placements:     []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 1}},
	}}})
	if err != nil {
		t.Fatalf("apply in-column reorder: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("expected applied outcome, got %+v", result)
	}
	if got := len(publisher.events()); got != 4 {
		t.Fatalf("expected every Visto card to be reflowed, got %d publications", got)
	}

	board, err := anime.NewScheduleQueryService(anime.NewQueryService(store)).GetEditorBoard(ctx, anime.GetAnimeEditorScheduleBoardQuery{})
	if err != nil {
		t.Fatalf("query reordered board: %v", err)
	}
	placementsByAnime := map[string][]contracts.MobileAnimeDay{}
	for _, entry := range board.Entries {
		placementsByAnime[entry.AnimeID] = entry.Placements
	}
	assertSchedulePlacement(t, placementsByAnime, "futsutsuka", "Visto", 1)
	assertSchedulePlacement(t, placementsByAnime, "iwamoto", "Visto", 2)
	assertSchedulePlacement(t, placementsByAnime, "tai-ari", "Visto", 3)
	assertSchedulePlacement(t, placementsByAnime, "tenmaku", "Visto", 4)
}

func TestScheduleServiceApplyReflowsSourceQueueAfterTwoCardsMoveToVisto(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloads := []string{
		`{"_id":"sayonara-lara","nombre":"Sayonara Lara","activo":true,"dias":[{"dia":"Sin ver","orden":1}]}`,
		`{"_id":"yani-neko","nombre":"Yani Neko","activo":true,"dias":[{"dia":"Sin ver","orden":2}]}`,
		`{"_id":"youjo-senki-ii","nombre":"Youjo Senki II","activo":true,"dias":[{"dia":"Sin ver","orden":3}]}`,
		`{"_id":"bang-dream","nombre":"BanG Dream! YumemoMita","activo":true,"dias":[{"dia":"Sin ver","orden":4}]}`,
		`{"_id":"futsutsuka","nombre":"Futsutsuka...","activo":true,"dias":[{"dia":"Visto","orden":1}]}`,
		`{"_id":"iwamoto","nombre":"Iwamoto...","activo":true,"dias":[{"dia":"Visto","orden":2}]}`,
		`{"_id":"tai-ari","nombre":"Tai-Ari...","activo":true,"dias":[{"dia":"Visto","orden":3}]}`,
		`{"_id":"tenmaku","nombre":"Tenmaku...","activo":true,"dias":[{"dia":"Visto","orden":4}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}

	service := anime.NewScheduleService(anime.NewQueryService(store), &stubAnimeWriter{path: writeLegacyDataFile(t, payloads...)})
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 108, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "sayonara-lara", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 1}}},
		{AnimeID: "bang-dream", BaseModifiedAt: 104, Placements: []contracts.MobileAnimeDay{{Dia: "Visto", Orden: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply two-card top insertion: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("expected applied outcome, got %+v", result)
	}

	board, err := anime.NewScheduleQueryService(anime.NewQueryService(store)).GetEditorBoard(ctx, anime.GetAnimeEditorScheduleBoardQuery{})
	if err != nil {
		t.Fatalf("query refreshed board: %v", err)
	}
	placementsByAnime := map[string][]contracts.MobileAnimeDay{}
	for _, entry := range board.Entries {
		placementsByAnime[entry.AnimeID] = entry.Placements
	}
	if got := placementsByAnime["yani-neko"]; len(got) != 1 || got[0].Dia != "Sin ver" || got[0].Orden != 1 {
		t.Fatalf("expected Yani Neko at Sin ver#1, got %+v", got)
	}
	if got := placementsByAnime["youjo-senki-ii"]; len(got) != 1 || got[0].Dia != "Sin ver" || got[0].Orden != 2 {
		t.Fatalf("expected Youjo Senki II at Sin ver#2, got %+v", got)
	}
	if got := placementsByAnime["sayonara-lara"]; len(got) != 1 || got[0].Dia != "Visto" || got[0].Orden != 1 {
		t.Fatalf("expected Sayonara Lara at Visto#1, got %+v", got)
	}
	if got := placementsByAnime["bang-dream"]; len(got) != 1 || got[0].Dia != "Visto" || got[0].Orden != 2 {
		t.Fatalf("expected BanG Dream! at Visto#2, got %+v", got)
	}
}

func TestScheduleServiceRejectsInvalidScheduleDraftsBeforeWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"_id":"anime-a","nombre":"A","activo":true,"dias":[{"dia":"Lunes","orden":1}]}`
	payloadB := `{"_id":"anime-b","nombre":"B","activo":true,"dias":[{"dia":"Viernes","orden":1}]}`
	payloadC := `{"_id":"anime-c","nombre":"C","activo":false,"dias":[{"dia":"Martes","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-c", payloadC, 103)
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payloadA, payloadB, payloadC)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)

	tests := []anime.ApplyAnimeScheduleDraftCommand{
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Dia: "Fake", Orden: 1}}}}},
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-a", BaseModifiedAt: 101}, {AnimeID: "anime-a", BaseModifiedAt: 101}}},
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-c", BaseModifiedAt: 103, Placements: []contracts.MobileAnimeDay{{Dia: "Lunes", Orden: 3}}}}},
	}

	for _, command := range tests {
		if _, err := service.Apply(ctx, command); err == nil {
			t.Fatalf("expected invalid schedule draft to be rejected: %+v", command)
		}
	}
	if writer.calls != 0 {
		t.Fatalf("invalid schedule drafts must not write, got %d writes", writer.calls)
	}
}

func TestScheduleServiceRejectsExplicitNonContiguousSundayPayload(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payload := `{"_id":"domingo-explicit","nombre":"Sunday Explicit","activo":true,"dias":[{"dia":"Domingo","orden":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "domingo-explicit", payload, 101)
	writer := &stubAnimeWriter{path: writeLegacyDataFile(t, payload)}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)

	_, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 101, Entries: []anime.ApplyAnimeScheduleDraftEntry{{
		AnimeID:        "domingo-explicit",
		BaseModifiedAt: 101,
		Placements:     []contracts.MobileAnimeDay{{Dia: "Domingo", Orden: 3}},
	}}})
	if err == nil {
		t.Fatal("expected explicit non-contiguous Sunday payload to be rejected")
	}
	if err.Error() != "non-contiguous positions for Domingo" {
		t.Fatalf("expected exact Sunday validation error, got %q", err.Error())
	}
	if writer.calls != 0 {
		t.Fatalf("expected zero writes for rejected Sunday payload, got %d", writer.calls)
	}
}
