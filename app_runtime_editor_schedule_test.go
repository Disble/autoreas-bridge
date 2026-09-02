package main

import (
	"context"
	"sort"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestApplyAnimeEditorScheduleMovesBanGDreamSayonaraLaraAndYaniNekoToVistoAndRefreshesTheBoard(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	payloads := runtimeScheduleFixturePayloads()
	seedRuntimeSchedulePayloads(t, store, payloads)
	initialSnapshotLines := runtimeScheduleLinesByAnimeID(t, payloads)

	// SDD-55 Slice B: ScheduleService.Apply finalizes a batch straight into
	// SQLite (anime_snapshots) -- no legacy file-replacement journal exists
	// anymore (ADR-55-3), so there is no backing file to seed here.
	query := anime.NewQueryService(store)
	publisher := &runtimeSchedulePublisher{}
	service := anime.NewScheduleService(query, &stubAppUpdateWriter{})
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	app := &App{
		ctx:                      context.Background(),
		animeEditorScheduleWrite: service,
		animeEditorScheduleQuery: anime.NewScheduleQueryService(query),
	}

	result := app.ApplyAnimeEditorSchedule(runtimeMovedCardsScheduleCommand())
	assertRuntimeScheduleApplyResult(t, result)
	assertRuntimeSchedulePublishedAnimeIDs(t, publisher.animeIDs())
	assertRuntimeScheduleBoardPlacements(t, runtimeBoardPlacementsByAnimeID(result.Board))
	assertRuntimeScheduleSnapshotWrites(t, initialSnapshotLines, readRuntimeScheduleLinesByAnimeID(t, store))
}

// runtimeScheduleLinesByAnimeID indexes schedule payloads by anime ID.
func runtimeScheduleLinesByAnimeID(t *testing.T, payloads []string) map[string]string {
	t.Helper()
	result := make(map[string]string, len(payloads))
	for _, payload := range payloads {
		result[runtimeAnimeIDFromSchedulePayload(t, payload)] = payload
	}
	return result
}

// readRuntimeScheduleLinesByAnimeID reads and indexes persisted snapshots by anime ID.
func readRuntimeScheduleLinesByAnimeID(t *testing.T, store *bridgeSync.AnimeSnapshotStore) map[string]string {
	t.Helper()
	records, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list runtime schedule snapshots: %v", err)
	}
	result := make(map[string]string, len(records))
	for id, record := range records {
		result[id] = string(record.CanonicalJSON)
	}
	return result
}

// assertRuntimeScheduleSnapshotWrites verifies changed and untouched snapshots.
func assertRuntimeScheduleSnapshotWrites(t *testing.T, initialLines, persistedLines map[string]string) {
	t.Helper()
	changedAnimeIDs := make([]string, 0)
	for animeID, initialLine := range initialLines {
		if persistedLines[animeID] != initialLine {
			changedAnimeIDs = append(changedAnimeIDs, animeID)
		}
	}
	sort.Strings(changedAnimeIDs)
	wantChanged := []string{"bang-dream", "futsutsuka", "iwamoto", "sayonara-lara", "tai-ari", "tenmaku", "yani-neko", "youjo-senki-ii"}
	if !runtimeStringSlicesEqual(changedAnimeIDs, wantChanged) {
		t.Fatalf("expected the three moves and the required destination reflow records to change, got %v", changedAnimeIDs)
	}
	for _, untouched := range []string{"equal-order-a", "equal-order-b"} {
		if persistedLines[untouched] != initialLines[untouched] {
			t.Fatalf("expected %s snapshot to stay byte-identical, got %q", untouched, persistedLines[untouched])
		}
	}
}

// runtimeScheduleFixturePayloads returns legacy schedule payloads for tests.
func runtimeScheduleFixturePayloads() []string {
	return []string{
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
		`{"id":"equal-order-b","name":"Equal Order B","active":true,"days":[{"day":"Lunes","order":1}]}`,
		`{"id":"equal-order-a","name":"Equal Order A","active":true,"days":[{"day":"Lunes","order":1}]}`,
	}
}

// seedRuntimeSchedulePayloads stores the runtime schedule test payloads.
func seedRuntimeSchedulePayloads(t *testing.T, store *bridgeSync.AnimeSnapshotStore, payloads []string) {
	t.Helper()
	for index, payload := range payloads {
		seedRuntimeAnimeSnapshot(t, store, runtimeAnimeIDFromSchedulePayload(t, payload), payload, int64(101+index))
	}
}

// runtimeMovedCardsScheduleCommand returns the schedule move command under test.
func runtimeMovedCardsScheduleCommand() ApplyAnimeScheduleDraftCommandDTO {
	return ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 112, Entries: []ApplyAnimeScheduleDraftEntryDTO{
		{AnimeID: "youjo-senki-ii", BaseModifiedAt: 103, Placements: []contracts.MobileAnimeDay{{Day: "Sin ver", Order: 1}}},
		{AnimeID: "bang-dream", BaseModifiedAt: 104, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 1}}},
		{AnimeID: "yani-neko", BaseModifiedAt: 102, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 2}}},
		{AnimeID: "sayonara-lara", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 3}}},
		{AnimeID: "futsutsuka", BaseModifiedAt: 105, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 4}}},
		{AnimeID: "iwamoto", BaseModifiedAt: 106, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 5}}},
		{AnimeID: "tai-ari", BaseModifiedAt: 107, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 6}}},
		{AnimeID: "tenmaku", BaseModifiedAt: 108, Placements: []contracts.MobileAnimeDay{{Day: "Visto", Order: 7}}},
	}}
}

// assertRuntimeScheduleApplyResult verifies the applied schedule response.
func assertRuntimeScheduleApplyResult(t *testing.T, result contracts.AnimeEditorScheduleApplyResult) {
	t.Helper()
	if result.Outcome != contracts.AnimePatchOutcomeApplied || result.Board == nil {
		t.Fatalf("expected applied schedule result with refreshed board, got %#v", result)
	}
	if result.Message != "apply_schedule applied" || len(result.Details) != 1 || result.Details["operation"] != "apply_schedule" {
		t.Fatalf("expected apply to succeed without extra feedback, got %#v", result)
	}
}

// assertRuntimeSchedulePublishedAnimeIDs verifies published schedule anime IDs.
func assertRuntimeSchedulePublishedAnimeIDs(t *testing.T, got []string) {
	t.Helper()
	want := []string{"bang-dream", "futsutsuka", "iwamoto", "sayonara-lara", "tai-ari", "tenmaku", "yani-neko", "youjo-senki-ii"}
	if len(got) != len(want) {
		t.Fatalf("expected three moved cards plus five reflowed cards, got %v", got)
	}
	if !runtimeStringSlicesEqual(got, want) {
		t.Fatalf("expected the moved cards and their reflowed destinations to publish, got %v", got)
	}
}

// assertRuntimeScheduleBoardPlacements verifies refreshed board placements.
func assertRuntimeScheduleBoardPlacements(t *testing.T, placementsByAnime map[string][]contracts.MobileAnimeDay) {
	t.Helper()
	for animeID, want := range map[string][]contracts.MobileAnimeDay{
		"youjo-senki-ii": {{Day: "Sin ver", Order: 1}},
		"bang-dream":     {{Day: "Visto", Order: 1}},
		"sayonara-lara":  {{Day: "Visto", Order: 3}},
		"yani-neko":      {{Day: "Visto", Order: 2}},
		"domingo-legacy": {{Day: "Domingo", Order: 1}},
	} {
		if got := placementsByAnime[animeID]; !runtimeDaysEqual(got, want) {
			t.Fatalf("expected %s placements %+v, got %+v", animeID, want, got)
		}
	}
}
