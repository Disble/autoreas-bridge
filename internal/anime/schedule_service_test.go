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
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Martes","order":1}]}`, 202)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 201, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 2}}},
	}})
	if err != nil {
		t.Fatalf("apply stale schedule draft: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeConflict {
		t.Fatalf("expected whole-draft conflict, got %+v", result)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict for stale draft, got %d", len(conflicts.inserted))
	}
	animeA, err := store.GetSnapshot(ctx, "anime-a")
	if err != nil || animeA.ModifiedAt != 101 {
		t.Fatalf("expected whole-draft conflict to leave anime-a untouched: %#v, %v", animeA, err)
	}
}

func TestScheduleServiceRejectsWholeDraftWhenUnchangedBoardMemberAdvances(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`
	payloadB := `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Martes","order":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 203)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}},
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
	payloadA := `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`
	payloadB := `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Martes","order":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 202)

	// failingFinalizeBatchStore fails the SQLite FinalizeBatch step, simulating
	// a batch failure before any snapshot is committed. SDD-55 Slice B:
	// ApplyBatch stages the whole batch then finalizes it in one SQLite step
	// (ADR-55-3) -- a FinalizeBatch failure must leave every snapshot in the
	// batch untouched (all-or-nothing), which is what this test now proves.
	failing := &failingFinalizeBatchStore{WriteBaseStore: store.WriteBaseStore()}
	service := anime.NewScheduleService(anime.NewQueryService(store), &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{WriteBases: failing})

	_, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 202, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 202, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 2}}},
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
	if string(first.CanonicalJSON) != `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}` || string(second.CanonicalJSON) != `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Martes","order":1}]}` {
		t.Fatalf("schedule apply must be fully atomic, got first=%s second=%s", first.CanonicalJSON, second.CanonicalJSON)
	}
}

func TestScheduleServiceApplyAcceptsValidPartialDraftIntoPopulatedWeekday(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`
	payloadB := `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Viernes","order":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)

	publisher := &editorRecordingPublisher{}
	writer := &stubAnimeWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	// anime-a is UNCHANGED at Lunes#1. Only anime-b is submitted, moved from
	// Viernes#1 to Lunes#2. The effective Lunes ordering is [1, 2] -- contiguous
	// -- so the draft is valid even though only the changed anime is in the draft.
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-b", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Day: "Lunes", Order: 2}}},
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
	payloadA := `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`
	payloadB := `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Martes","order":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)

	publisher := &editorRecordingPublisher{}
	writer := &stubAnimeWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}},
		{AnimeID: "anime-b", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 2}}},
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
		`{"id":"sayonara-lara","name":"Sayonara Lara","active":true,"days":[{"day":"Sin ver","order":1}]}`,
		`{"id":"yani-neko","name":"Yani Neko","active":true,"days":[{"day":"Sin ver","order":2}]}`,
		`{"id":"youjo-senki-ii","name":"Youjo Senki II","active":true,"days":[{"day":"Sin ver","order":3}]}`,
		`{"id":"bang-dream","name":"BanG Dream! YumemoMita","active":true,"days":[{"day":"Sin ver","order":4}]}`,
		`{"id":"futsutsuka","name":"Futsutsuka...","active":true,"days":[{"day":"Visto","order":1}]}`,
		`{"id":"iwamoto","name":"Iwamoto...","active":true,"days":[{"day":"Visto","order":2}]}`,
		`{"id":"tai-ari","name":"Tai-Ari...","active":true,"days":[{"day":"Visto","order":3}]}`,
		`{"id":"tenmaku","name":"Tenmaku...","active":true,"days":[{"day":"Visto","order":4}]}`,
		`{"id":"domingo-legacy","name":"Sunday Legacy","active":true,"days":[{"day":"Domingo","order":2}]}`,
		`{"id":"legacy-unsupported","name":"Legacy Unsupported","active":true,"days":[{"day":"Especial legado","order":9}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}

	writer := &stubAnimeWriter{}
	publisher := &editorRecordingPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 110, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "bang-dream", BaseModifiedAt: 104, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 1}}},
		{AnimeID: "sayonara-lara", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 3}}},
		{AnimeID: "yani-neko", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 2}}},
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
	assertSchedulePublishedAnimeChanged(t, publisher.events()[0], "bang-dream", `{"id":"bang-dream","name":"BanG Dream! YumemoMita","episodesWatched":0,"active":true,"days":[{"day":"Visto","order":1}]}`)
	for _, test := range []struct {
		id, day string
		order   float64
	}{{"domingo-legacy", "Domingo", 2}, {"legacy-unsupported", "Especial legado", 9}, {"bang-dream", "Visto", 1}} {
		snapshot, err := store.GetSnapshot(ctx, test.id)
		if err != nil {
			t.Fatal(err)
		}
		days := decodeSchedulePayloadDays(t, snapshot.CanonicalJSON)
		if len(days) != 1 || days[0].Day != test.day || days[0].Order != test.order {
			t.Fatalf("unexpected %s days: %+v", test.id, days)
		}
	}
}

func TestScheduleServiceApplyReordersEveryCardAfterAnInColumnMove(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloads := []string{
		`{"id":"iwamoto","name":"Iwamoto...","active":true,"days":[{"day":"Visto","order":1}]}`,
		`{"id":"tai-ari","name":"Tai-Ari...","active":true,"days":[{"day":"Visto","order":2}]}`,
		`{"id":"tenmaku","name":"Tenmaku...","active":true,"days":[{"day":"Visto","order":3}]}`,
		`{"id":"futsutsuka","name":"Futsutsuka...","active":true,"days":[{"day":"Visto","order":4}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}

	publisher := &editorRecordingPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), &stubAnimeWriter{})
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 104, Entries: []anime.ApplyAnimeScheduleDraftEntry{{
		AnimeID:        "futsutsuka",
		BaseModifiedAt: 104,
		Placements:     []contracts.MobileAnimeDay{{Day: "Visto", Order: 1}},
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
		`{"id":"sayonara-lara","name":"Sayonara Lara","active":true,"days":[{"day":"Sin ver","order":1}]}`,
		`{"id":"yani-neko","name":"Yani Neko","active":true,"days":[{"day":"Sin ver","order":2}]}`,
		`{"id":"youjo-senki-ii","name":"Youjo Senki II","active":true,"days":[{"day":"Sin ver","order":3}]}`,
		`{"id":"bang-dream","name":"BanG Dream! YumemoMita","active":true,"days":[{"day":"Sin ver","order":4}]}`,
		`{"id":"futsutsuka","name":"Futsutsuka...","active":true,"days":[{"day":"Visto","order":1}]}`,
		`{"id":"iwamoto","name":"Iwamoto...","active":true,"days":[{"day":"Visto","order":2}]}`,
		`{"id":"tai-ari","name":"Tai-Ari...","active":true,"days":[{"day":"Visto","order":3}]}`,
		`{"id":"tenmaku","name":"Tenmaku...","active":true,"days":[{"day":"Visto","order":4}]}`,
	}
	for index, payload := range payloads {
		seedAnimeSnapshotWithModifiedAt(t, store, animeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}

	service := anime.NewScheduleService(anime.NewQueryService(store), &stubAnimeWriter{})
	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 108, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "sayonara-lara", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 1}}},
		{AnimeID: "bang-dream", BaseModifiedAt: 104, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 2}}},
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
	if got := placementsByAnime["yani-neko"]; len(got) != 1 || got[0].Day != "Sin ver" || got[0].Order != 1 {
		t.Fatalf("expected Yani Neko at Sin ver#1, got %+v", got)
	}
	if got := placementsByAnime["youjo-senki-ii"]; len(got) != 1 || got[0].Day != "Sin ver" || got[0].Order != 2 {
		t.Fatalf("expected Youjo Senki II at Sin ver#2, got %+v", got)
	}
	if got := placementsByAnime["sayonara-lara"]; len(got) != 1 || got[0].Day != "Visto" || got[0].Order != 1 {
		t.Fatalf("expected Sayonara Lara at Visto#1, got %+v", got)
	}
	if got := placementsByAnime["bang-dream"]; len(got) != 1 || got[0].Day != "Visto" || got[0].Order != 2 {
		t.Fatalf("expected BanG Dream! at Visto#2, got %+v", got)
	}
}

func TestScheduleServiceRejectsInvalidScheduleDraftsBeforeWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payloadA := `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`
	payloadB := `{"id":"anime-b","name":"B","active":true,"days":[{"day":"Viernes","order":1}]}`
	payloadC := `{"id":"anime-c","name":"C","active":false,"days":[{"day":"Martes","order":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", payloadA, 101)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-b", payloadB, 102)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-c", payloadC, 103)
	writer := &stubAnimeWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)

	tests := []anime.ApplyAnimeScheduleDraftCommand{
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Fake", Order: 1}}}}},
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-a", BaseModifiedAt: 101}, {AnimeID: "anime-a", BaseModifiedAt: 101}}},
		{BoardModifiedAt: 102, Entries: []anime.ApplyAnimeScheduleDraftEntry{{AnimeID: "anime-c", BaseModifiedAt: 103, Placements: []contracts.MobileAnimeDay{{Day: "Lunes", Order: 3}}}}},
	}

	for _, command := range tests {
		if _, err := service.Apply(ctx, command); err == nil {
			t.Fatalf("expected invalid schedule draft to be rejected: %+v", command)
		}
	}
	animeA, err := store.GetSnapshot(ctx, "anime-a")
	if err != nil || animeA.ModifiedAt != 101 {
		t.Fatalf("invalid schedule drafts must not finalize any write: %#v, %v", animeA, err)
	}
}

func TestScheduleServiceRejectsExplicitNonContiguousSundayPayload(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	payload := `{"id":"domingo-explicit","name":"Sunday Explicit","active":true,"days":[{"day":"Domingo","order":1}]}`
	seedAnimeSnapshotWithModifiedAt(t, store, "domingo-explicit", payload, 101)
	writer := &stubAnimeWriter{}
	service := anime.NewScheduleService(anime.NewQueryService(store), writer)

	_, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 101, Entries: []anime.ApplyAnimeScheduleDraftEntry{{
		AnimeID:        "domingo-explicit",
		BaseModifiedAt: 101,
		Placements:     []contracts.MobileAnimeDay{{Day: "Domingo", Order: 3}},
	}}})
	if err == nil {
		t.Fatal("expected explicit non-contiguous Sunday payload to be rejected")
	}
	if err.Error() != "non-contiguous positions for Domingo" {
		t.Fatalf("expected exact Sunday validation error, got %q", err.Error())
	}
	current, err := store.GetSnapshot(ctx, "domingo-explicit")
	if err != nil || current.ModifiedAt != 101 {
		t.Fatalf("expected rejected Sunday payload to leave the snapshot untouched: %#v, %v", current, err)
	}
}
