package main

import (
	"context"
	"encoding/json"
	"sort"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestGetAnimeEditorRecordReturnsNilWhenServiceUnavailable(t *testing.T) {
	app := &App{}
	if got := app.GetAnimeEditorRecord("anime-1"); got.Outcome != contracts.AnimePatchOutcomeError || got.Record != nil {
		t.Fatalf("expected explicit error when editor query is unavailable, got %#v", got)
	}
}

func TestGetAnimeEditorRecordDelegatesToEditorQuery(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"studios":["Madhouse"],"cover":{"type":"url","path":"C:/covers/frieren.jpg"}}`, 777)
	query := anime.NewQueryService(store)
	app := &App{ctx: context.Background(), animeEditorQuery: query}

	got := app.GetAnimeEditorRecord("anime-1")
	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.Record == nil || got.Record.AnimeID != "anime-1" || got.Record.ModifiedAt != 777 {
		t.Fatalf("unexpected editor record: %#v", got)
	}
}

func TestSaveAnimeEditorDelegatesToEditorService(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	writer := &stubAppUpdateWriter{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	app := &App{ctx: context.Background(), animeEditorWrite: service}
	name := "Frieren X"

	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100, Patch: AnimeEditorPatchDTO{Name: &name}})
	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.ModifiedAt != 200 {
		t.Fatalf("unexpected save result: %#v", got)
	}
}

func TestSaveAnimeEditorReturnsExplicitOutcomeWhenServiceUnavailable(t *testing.T) {
	app := &App{}
	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{})
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Message == "" {
		t.Fatalf("expected explicit error outcome when editor service is unavailable, got %#v", got)
	}
}

func TestDeactivateAnimeReturnsExplicitOutcomeWhenServiceUnavailable(t *testing.T) {
	app := &App{}
	got := app.DeactivateAnime("anime-1", 10)
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Message == "" {
		t.Fatalf("expected explicit error outcome when deactivate service is unavailable, got %#v", got)
	}
}

func TestApplyAnimeEditorScheduleReturnsExplicitOutcomeWhenServiceUnavailable(t *testing.T) {
	app := &App{}
	got := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{})
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Message == "" {
		t.Fatalf("expected explicit error outcome when schedule service is unavailable, got %#v", got)
	}
}

func TestGetAnimeEditorScheduleBoardDelegatesToScheduleQuery(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","active":true,"days":[{"day":"Viernes","order":1}]}`, 100)
	query := anime.NewQueryService(store)
	app := &App{ctx: context.Background(), animeEditorScheduleQuery: anime.NewScheduleQueryService(query)}

	got := app.GetAnimeEditorScheduleBoard("anime-1")
	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.Board == nil || len(got.Board.Entries) != 1 || !got.Board.Entries[0].OriginHighlighted {
		t.Fatalf("unexpected schedule board: %#v", got)
	}
}

func TestSaveAnimeEditorReturnsErrorOutcomeForValidationFailure(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	writer := &stubAppUpdateWriter{}
	service := anime.NewEditorService(store, writer)
	app := &App{ctx: context.Background(), animeEditorWrite: service, animeEditorQuery: anime.NewQueryService(store)}
	blank := " "
	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100, Patch: AnimeEditorPatchDTO{Name: &blank}})
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Message == "" || got.Details["operation"] != "save" {
		t.Fatalf("expected useful validation error outcome, got %#v", got)
	}
}

func TestSaveAnimeEditorReturnsConflictWithRefreshedRecord(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	service := anime.NewEditorService(store, &stubAppUpdateWriter{})
	service.SetDeps(anime.WriteServiceDeps{Conflicts: bridgeSync.NewConflictStore(db)})
	app := &App{ctx: context.Background(), animeEditorWrite: service, animeEditorQuery: anime.NewQueryService(store)}
	name := "Stale"
	got := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 99, Patch: AnimeEditorPatchDTO{Name: &name}})
	if got.Outcome != contracts.AnimePatchOutcomeConflict || got.Record == nil || got.Record.ModifiedAt != 100 || got.ConflictID == "" {
		t.Fatalf("expected conflict authority, got %#v", got)
	}
}

func TestSaveAnimeEditorRejectsMalformedNumericAndForbiddenOwnershipWithExplicitOutcome(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	service := anime.NewEditorService(store, &stubAppUpdateWriter{})
	app := &App{ctx: context.Background(), animeEditorWrite: service, animeEditorQuery: anime.NewQueryService(store)}
	requests := []string{
		`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"totalEpisodes":{"present":true,"value":"twelve"}}}`,
		`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"modified_at":100}}`,
		`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"repetitions":[]}}`,
		`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"firstCycle":false}}`,
		`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"id":"other"}}`,
	}
	for _, payload := range requests {
		var command SaveAnimeEditorCommandDTO
		if err := json.Unmarshal([]byte(payload), &command); err != nil {
			t.Fatalf("binding DTO must capture malformed input for explicit outcome: %v", err)
		}
		got := app.SaveAnimeEditor(command)
		if got.Outcome != contracts.AnimePatchOutcomeError || got.Message == "" {
			t.Fatalf("malformed/forbidden patch returned misleading result: payload=%s result=%#v", payload, got)
		}
	}
}

func TestDeactivateAnimeReturnsAppliedAuthority(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true}`, 100)
	service := anime.NewEditorService(store, &stubAppUpdateWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	app := &App{ctx: context.Background(), animeEditorWrite: service, animeEditorQuery: anime.NewQueryService(store)}
	got := app.DeactivateAnime("anime-1", 100)
	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.ModifiedAt != 200 || got.Record == nil || got.Record.Frequent.Active {
		t.Fatalf("expected applied deactivate authority, got %#v", got)
	}
}

func TestApplyAnimeEditorScheduleReturnsConflictWithRefreshedBoard(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"days":[{"day":"Lunes","order":1}]}`, 100)
	query := anime.NewQueryService(store)
	app := &App{
		ctx: context.Background(), animeEditorScheduleWrite: anime.NewScheduleService(query, &stubAppUpdateWriter{}),
		animeEditorScheduleQuery: anime.NewScheduleQueryService(query),
	}
	got := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 99, Entries: []ApplyAnimeScheduleDraftEntryDTO{{AnimeID: "anime-1", BaseModifiedAt: 100, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}}}})
	if got.Outcome != contracts.AnimePatchOutcomeConflict || got.Board == nil || got.Board.BoardModifiedAt != 100 || got.Message == "" {
		t.Fatalf("expected schedule conflict with refreshed authority, got %#v", got)
	}
}

func TestApplyAnimeEditorScheduleReturnsValidationErrorWithRefreshedBoard(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"days":[{"day":"Lunes","order":1}]}`, 100)
	query := anime.NewQueryService(store)
	app := &App{
		ctx: context.Background(), animeEditorScheduleWrite: anime.NewScheduleService(query, &stubAppUpdateWriter{}),
		animeEditorScheduleQuery: anime.NewScheduleQueryService(query),
	}
	got := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 100, Entries: []ApplyAnimeScheduleDraftEntryDTO{{AnimeID: "anime-1", BaseModifiedAt: 100, Placements: []contracts.MobileAnimeDay{{Day: "Unsafe", Order: 1}}}}})
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Board == nil || got.Message == "" || got.Details["operation"] != "apply_schedule" {
		t.Fatalf("expected validation error with refreshed board, got %#v", got)
	}
}

func TestApplyAnimeEditorScheduleRejectsMalformedSundayPayloadWithoutWrite(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"days":[{"day":"Domingo","order":1}]}`, 100)
	query := anime.NewQueryService(store)
	app := &App{
		ctx: context.Background(), animeEditorScheduleWrite: anime.NewScheduleService(query, &stubAppUpdateWriter{}),
		animeEditorScheduleQuery: anime.NewScheduleQueryService(query),
	}

	got := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 100, Entries: []ApplyAnimeScheduleDraftEntryDTO{{
		AnimeID:        "anime-1",
		BaseModifiedAt: 100,
		Placements:     []contracts.MobileAnimeDay{{Day: "Domingo", Order: 3}},
	}}})
	if got.Outcome != contracts.AnimePatchOutcomeError || got.Board == nil || got.Message != "apply anime editor schedule: non-contiguous positions for Domingo" || got.Details["operation"] != "apply_schedule" {
		t.Fatalf("expected exact malformed Sunday validation outcome, got %#v", got)
	}
	if got.Board.BoardModifiedAt != 100 || len(got.Board.Entries) != 1 || len(got.Board.Entries[0].Placements) != 1 || got.Board.Entries[0].Placements[0].Day != "Domingo" || got.Board.Entries[0].Placements[0].Order != 1 {
		t.Fatalf("expected unchanged authoritative Sunday board after rejection, got %#v", got.Board)
	}
	after, err := query.GetReadRecord(context.Background(), "anime-1")
	if err != nil {
		t.Fatalf("read unchanged snapshot after malformed Sunday apply: %v", err)
	}
	placements := decodeRuntimeScheduleDays(t, after.Snapshot.CanonicalJSON)
	if len(placements) != 1 || placements[0].Day != "Domingo" || placements[0].Order != 1 {
		t.Fatalf("expected zero write for malformed Sunday payload, got %+v", placements)
	}
}

// decodeRuntimeScheduleDays decodes day placements from a schedule payload.
func decodeRuntimeScheduleDays(t *testing.T, payload []byte) []struct {
	Day   string  `json:"day"`
	Order float64 `json:"order"`
} {
	t.Helper()
	var decoded struct {
		Days []struct {
			Day   string  `json:"day"`
			Order float64 `json:"order"`
		} `json:"days"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode runtime schedule payload days: %v", err)
	}
	return decoded.Days
}

func TestEditorReadBindingsReturnInfrastructureErrorsWithoutZeroValueAuthority(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	query := anime.NewQueryService(store)
	boardQuery := anime.NewScheduleQueryService(query)
	if err := db.Close(); err != nil {
		t.Fatalf("close test database: %v", err)
	}
	app := &App{ctx: context.Background(), animeEditorQuery: query, animeEditorScheduleQuery: boardQuery}
	recordResult := app.GetAnimeEditorRecord("anime-1")
	boardResult := app.GetAnimeEditorScheduleBoard("anime-1")
	if recordResult.Outcome != contracts.AnimePatchOutcomeError || recordResult.Record != nil || recordResult.Message == "" {
		t.Fatalf("unexpected record infrastructure result: %#v", recordResult)
	}
	if boardResult.Outcome != contracts.AnimePatchOutcomeError || boardResult.Board != nil || boardResult.Message == "" {
		t.Fatalf("unexpected board infrastructure result: %#v", boardResult)
	}
}

type runtimeSchedulePublisher struct{ recorded []events.Event }

func (p *runtimeSchedulePublisher) Publish(event events.Event) {
	p.recorded = append(p.recorded, event)
}

// animeIDs returns the sorted anime IDs from published change events.
func (p *runtimeSchedulePublisher) animeIDs() []string {
	ids := make([]string, 0, len(p.recorded))
	for _, event := range p.recorded {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			continue
		}
		ids = append(ids, changed.AnimeID)
	}
	sort.Strings(ids)
	return ids
}

// runtimeAnimeIDFromSchedulePayload extracts an anime ID from a schedule payload.
func runtimeAnimeIDFromSchedulePayload(t *testing.T, payload string) string {
	t.Helper()
	var decoded struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		t.Fatalf("decode runtime anime id from payload: %v", err)
	}
	return decoded.ID
}

// runtimeBoardPlacementsByAnimeID indexes board placements by anime ID.
func runtimeBoardPlacementsByAnimeID(board *contracts.AnimeEditorScheduleBoard) map[string][]contracts.MobileAnimeDay {
	result := make(map[string][]contracts.MobileAnimeDay, len(board.Entries))
	for _, entry := range board.Entries {
		result[entry.AnimeID] = append([]contracts.MobileAnimeDay(nil), entry.Placements...)
	}
	return result
}

// runtimeDaysEqual reports whether two placement slices are equal.
func runtimeDaysEqual(got, want []contracts.MobileAnimeDay) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}

// runtimeStringSlicesEqual reports whether two string slices are equal.
func runtimeStringSlicesEqual(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}
