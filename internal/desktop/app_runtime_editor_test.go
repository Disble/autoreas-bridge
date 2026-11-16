package desktop

import (
	"context"
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/lifecycle"
	sharedlogger "autoreas-bridge/internal/logger"
	bridgeSync "autoreas-bridge/internal/sync"
)

// editorServices returns the anime module services the Editor, create and desktop-action
// bindings use, over one snapshot store.
func editorServices(store *bridgeSync.AnimeSnapshotStore) animeServices {
	query := anime.NewQueryService(store)
	return animeServices{
		query:         query,
		editorQuery:   query,
		editorWrite:   anime.NewEditorService(store, &stubAppCommittedPublisher{}),
		scheduleQuery: anime.NewScheduleQueryService(query),
		scheduleWrite: anime.NewScheduleService(query, &stubAppCommittedPublisher{}),
		createBatch:   anime.NewCreateService(anime.NewWriteService(store, &stubAppCommittedPublisher{})),
	}
}

// editorBindings calls each Editor, create and desktop-action binding that runs through the
// anime handle.
var editorBindings = []struct {
	name string
	call func(*App) (any, error)
}{
	{"GetAnimeEditorRecord", func(a *App) (any, error) { return a.GetAnimeEditorRecord("anime-1") }},
	{"GetAnimeEditorScheduleBoard", func(a *App) (any, error) { return a.GetAnimeEditorScheduleBoard("anime-1") }},
	{"SaveAnimeEditor", func(a *App) (any, error) { return a.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1"}) }},
	{"DeactivateAnime", func(a *App) (any, error) { return a.DeactivateAnime("anime-1", 100) }},
	{"ApplyAnimeEditorSchedule", func(a *App) (any, error) { return a.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{}) }},
	{"CreateAnime", func(a *App) (any, error) { return a.CreateAnime(AnimeCreateCommandDTO{}) }},
	{"OpenAnimePage", func(a *App) (any, error) { return a.OpenAnimePage("anime-1") }},
	{"CopyAnimePage", func(a *App) (any, error) { return a.CopyAnimePage("anime-1") }},
	{"OpenAnimeFolder", func(a *App) (any, error) { return a.OpenAnimeFolder("anime-1") }},
	{"CopyAnimeFolder", func(a *App) (any, error) { return a.CopyAnimeFolder("anime-1") }},
}

// TestEditorBindingsFollowTheAnimeModule pins S1 for the Editor, create and desktop-action
// bindings: none of them reads, writes or launches while the module starts or after it failed,
// and none answers an "error" outcome or status in place of the module's coded failure.
func TestEditorBindingsFollowTheAnimeModule(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		state    lifecycle.State
		wantCode apperr.Code
		wantMsg  string
	}{
		{"starting is unavailable", lifecycle.StateStarting, apperr.CodeUnavailable, "anime is starting"},
		{"failed is a failed precondition", lifecycle.StateFailed, apperr.CodeFailedPrecondition, "bridge database failed to open: locked"},
	}
	for _, binding := range editorBindings {
		for _, tc := range cases {
			t.Run(binding.name+"/"+tc.name, func(t *testing.T) {
				t.Parallel()
				launched := false
				app := animeApp(animeServices{}, tc.state)
				app.openURL = func(context.Context, string) { launched = true }
				app.openFolder = func(string) error { launched = true; return nil }
				app.copyText = func(context.Context, string) error { launched = true; return nil }

				value, err := binding.call(app)

				assertAnimeFailure(t, value, err, tc.wantCode, tc.wantMsg)
				if launched {
					t.Fatal("a desktop action launched while the anime module was not ready")
				}
			})
		}
	}
}

// TestEditorReadsAnswerThroughTheReadyModule pins the ready answers of the two Editor reads.
func TestEditorReadsAnswerThroughTheReadyModule(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"studios":["Madhouse"],"days":[{"day":"Viernes","order":1}],"cover":{"type":"url","path":"C:/covers/frieren.jpg"}}`, 777)
	app := readyAnimeApp(editorServices(store))

	record, err := app.GetAnimeEditorRecord("anime-1")
	if err != nil || record.Outcome != contracts.AnimePatchOutcomeApplied || record.Record == nil || record.Record.AnimeID != "anime-1" || record.Record.ModifiedAt != 777 {
		t.Fatalf("GetAnimeEditorRecord() = %#v, %v", record, err)
	}
	board, err := app.GetAnimeEditorScheduleBoard("anime-1")
	if err != nil || board.Outcome != contracts.AnimePatchOutcomeApplied || board.Board == nil || len(board.Board.Entries) != 1 || !board.Board.Entries[0].OriginHighlighted {
		t.Fatalf("GetAnimeEditorScheduleBoard() = %#v, %v", board, err)
	}
}

// TestEditorReadsMapTheirFailures pins the ready reads' failure codes: an unknown anime is
// not_found, a failed store read is internal, both under the binding's message.
func TestEditorReadsMapTheirFailures(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	app := readyAnimeApp(editorServices(bridgeSync.NewAnimeSnapshotStore(db)))
	record, err := app.GetAnimeEditorRecord("anime-missing")
	assertEditorWriteError(t, record, err, apperr.CodeNotFound, "get anime editor record: ")
	if err := db.Close(); err != nil {
		t.Fatalf("close test database: %v", err)
	}
	record, err = app.GetAnimeEditorRecord("anime-1")
	assertEditorWriteError(t, record, err, apperr.CodeInternal, "get anime editor record: ")
	board, err := app.GetAnimeEditorScheduleBoard("anime-1")
	assertEditorWriteError(t, board, err, apperr.CodeInternal, "get anime editor schedule board: ")
}

func TestSaveAnimeEditorDelegatesToEditorService(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	services := editorServices(store)
	services.editorWrite.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	app := readyAnimeApp(services)
	app.bridgeDB, app.animeQuery = db, services.query
	memLogger := attachEditorMemLogger(app)
	name, sameStatus := "Frieren X", 0

	got, err := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100, Patch: AnimeEditorPatchDTO{Name: &name, Status: &sameStatus}})
	if err != nil || got.Outcome != contracts.AnimePatchOutcomeApplied || got.ModifiedAt != 200 || got.Record == nil || got.Record.Frequent.Name != "Frieren X" {
		t.Fatalf("unexpected save result: %#v, %v", got, err)
	}
	assertEditorFailuresLogged(t, memLogger, "anime-1", "save", 0)
	// A rename that resends an unchanged state is not a watch change.
	if rows := editorActivityRows(t, db); len(rows) != 0 {
		t.Fatalf("expected no history for a rename, got %#v", rows)
	}
}

// attachEditorMemLogger wires an in-memory shared logger into app and returns it.
func attachEditorMemLogger(app *App) *sharedlogger.MemLogger {
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)
	return memLogger
}

// assertEditorFailuresLogged pins the failed-write rows Activity reads: domain,
// level, event type, entity and operation, never the message prose.
func assertEditorFailuresLogged(t *testing.T, memLogger *sharedlogger.MemLogger, animeID, operation string, want int) {
	t.Helper()
	got := 0
	for _, entry := range memLogger.Recent() {
		if entry.EventType != "anime.editor_save_failed" {
			continue
		}
		got++
		if entry.Domain != "anime" || entry.Level != sharedlogger.LevelError || entry.EntityID != animeID || entry.Metadata["operation"] != operation {
			t.Fatalf("editor failure row = %+v, want domain anime, level error, entity %q, operation %q", entry, animeID, operation)
		}
	}
	if got != want {
		t.Fatalf("logged %d editor failure rows, want %d", got, want)
	}
}

// assertEditorWriteError checks a failed Editor binding answered wantCode under wantPrefix and
// its zero value, never an "error" outcome.
func assertEditorWriteError(t *testing.T, value any, err error, wantCode apperr.Code, wantPrefix string) {
	t.Helper()
	code, _ := apperr.CodeOf(err)
	if err == nil || code != wantCode || !strings.HasPrefix(err.Error(), wantPrefix) {
		t.Fatalf("err = %v (code %q), want code %q and a message starting %q", err, code, wantCode, wantPrefix)
	}
	if !reflect.ValueOf(value).IsZero() {
		t.Fatalf("a failed binding answered %#v, want its zero value", value)
	}
}

func TestSaveAnimeEditorReturnsAnErrorForValidationFailure(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	app := readyAnimeApp(editorServices(store))
	memLogger := attachEditorMemLogger(app)
	blank := " "
	got, err := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 100, Patch: AnimeEditorPatchDTO{Name: &blank}})
	assertEditorWriteError(t, got, err, apperr.CodeInternal, "save anime editor: ")
	assertEditorFailuresLogged(t, memLogger, "anime-1", "save", 1)
}

func TestSaveAnimeEditorReturnsConflictWithRefreshedRecord(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	services := editorServices(store)
	services.editorWrite.SetDeps(anime.WriteServiceDeps{Conflicts: bridgeSync.NewConflictStore(db)})
	app := readyAnimeApp(services)
	name := "Stale"
	got, err := app.SaveAnimeEditor(SaveAnimeEditorCommandDTO{AnimeID: "anime-1", BaseModifiedAt: 99, Patch: AnimeEditorPatchDTO{Name: &name}})
	if err != nil || got.Outcome != contracts.AnimePatchOutcomeConflict || got.Record == nil || got.Record.ModifiedAt != 100 || got.ConflictID == "" {
		t.Fatalf("expected conflict authority, got %#v, %v", got, err)
	}
}

// TestEditorWritesKeepTheirOutcomeWhenTheRecordRefreshFails pins that a committed write still
// answers its outcome when the record read after it fails, and names that failure in Details.
func TestEditorWritesKeepTheirOutcomeWhenTheRecordRefreshFails(t *testing.T) {
	closed := openRuntimeBridgeDB(t)
	query := anime.NewQueryService(bridgeSync.NewAnimeSnapshotStore(closed))
	if err := closed.Close(); err != nil {
		t.Fatalf("close test database: %v", err)
	}
	app := &App{ctx: context.Background()}
	got := app.editorSaveResult(animeServices{editorQuery: query}, "save", anime.PatchResult{Outcome: contracts.AnimePatchOutcomeApplied, AnimeID: "anime-1", ModifiedAt: 200})
	if got.Outcome != contracts.AnimePatchOutcomeApplied || got.ModifiedAt != 200 || got.Record != nil || got.Details["refreshError"] == "" || got.Details["operation"] != "save" {
		t.Fatalf("editorSaveResult() = %#v, want the applied outcome with a refreshError", got)
	}
}

func TestSaveAnimeEditorRejectsMalformedNumericAndForbiddenOwnershipWithAnError(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2}`, 100)
	app := readyAnimeApp(editorServices(store))
	memLogger := attachEditorMemLogger(app)
	defer func() { assertEditorFailuresLogged(t, memLogger, "anime-1", "save", 5) }()
	// The DTO conversion rejects a malformed value as invalid_argument; the editor service
	// rejects a forbidden ownership field with an untyped error, so that one is internal.
	requests := []struct {
		payload string
		code    apperr.Code
	}{
		{`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"totalEpisodes":{"present":true,"value":"twelve"}}}`, apperr.CodeInvalidArgument},
		{`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"modified_at":100}}`, apperr.CodeInternal},
		{`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"repetitions":[]}}`, apperr.CodeInternal},
		{`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"firstCycle":false}}`, apperr.CodeInternal},
		{`{"animeId":"anime-1","baseModifiedAt":100,"patch":{"id":"other"}}`, apperr.CodeInternal},
	}
	for _, request := range requests {
		var command SaveAnimeEditorCommandDTO
		if err := json.Unmarshal([]byte(request.payload), &command); err != nil {
			t.Fatalf("binding DTO must capture malformed input for explicit outcome: %v", err)
		}
		got, err := app.SaveAnimeEditor(command)
		assertEditorWriteError(t, got, err, request.code, "save anime editor: ")
	}
}

func TestDeactivateAnimeReturnsAppliedAuthority(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"status":1,"active":true}`, 100)
	services := editorServices(store)
	services.editorWrite.SetNow(func() time.Time { return time.UnixMilli(200).UTC() })
	app := readyAnimeApp(services)
	app.bridgeDB, app.animeQuery = db, services.query
	memLogger := attachEditorMemLogger(app)
	got, err := app.DeactivateAnime("anime-1", 100)
	if err != nil || got.Outcome != contracts.AnimePatchOutcomeApplied || got.ModifiedAt != 200 || got.Record == nil || got.Record.Frequent.Active {
		t.Fatalf("expected applied deactivate authority, got %#v, %v", got, err)
	}
	assertEditorFailuresLogged(t, memLogger, "anime-1", "deactivate", 0)
	missing, err := app.DeactivateAnime("anime-missing", 100)
	assertEditorWriteError(t, missing, err, apperr.CodeInternal, "deactivate anime: ")
	assertEditorFailuresLogged(t, memLogger, "anime-missing", "deactivate", 1)
	// Only the applied deactivation is history, recorded as the card command records it.
	want := editorActivityRow{
		source: "desktop", action: anime.ActivityActionAnimeSoftDeleted, name: "Frieren", correlation: "anime.editor:anime-1:200", occurredAtMs: 200,
		before: anime.ActivityAnimeSnapshot{Estado: 1, NroCapVisto: 2, Activo: 1}, after: anime.ActivityAnimeSnapshot{Estado: 1, NroCapVisto: 2, Activo: 0},
	}
	if rows := editorActivityRows(t, db); len(rows) != 1 || rows[0] != want {
		t.Fatalf("expected one soft-delete row %#v, got %#v", want, rows)
	}
}

func TestApplyAnimeEditorScheduleReturnsConflictWithRefreshedBoard(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"days":[{"day":"Lunes","order":1}]}`, 100)
	app := readyAnimeApp(editorServices(store))
	got, err := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 99, Entries: []ApplyAnimeScheduleDraftEntryDTO{{AnimeID: "anime-1", BaseModifiedAt: 100, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}}}})
	if err != nil || got.Outcome != contracts.AnimePatchOutcomeConflict || got.Board == nil || got.Board.BoardModifiedAt != 100 || got.Message == "" {
		t.Fatalf("expected schedule conflict with refreshed authority, got %#v, %v", got, err)
	}
}

func TestApplyAnimeEditorScheduleReturnsAnErrorForAnUnsafeDay(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"days":[{"day":"Lunes","order":1}]}`, 100)
	app := readyAnimeApp(editorServices(store))
	got, err := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 100, Entries: []ApplyAnimeScheduleDraftEntryDTO{{AnimeID: "anime-1", BaseModifiedAt: 100, Placements: []contracts.MobileAnimeDay{{Day: "Unsafe", Order: 1}}}}})
	assertEditorWriteError(t, got, err, apperr.CodeInternal, "apply anime editor schedule: ")
}

func TestApplyAnimeEditorScheduleRejectsMalformedSundayPayloadWithoutWrite(t *testing.T) {
	db := openRuntimeBridgeDB(t)
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedRuntimeAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Frieren","episodesWatched":2,"active":true,"days":[{"day":"Domingo","order":1}]}`, 100)
	services := editorServices(store)
	app := readyAnimeApp(services)

	got, err := app.ApplyAnimeEditorSchedule(ApplyAnimeScheduleDraftCommandDTO{BoardModifiedAt: 100, Entries: []ApplyAnimeScheduleDraftEntryDTO{{
		AnimeID:        "anime-1",
		BaseModifiedAt: 100,
		Placements:     []contracts.MobileAnimeDay{{Day: "Domingo", Order: 3}},
	}}})
	if err == nil || err.Error() != "apply anime editor schedule: non-contiguous positions for Domingo" || !reflect.ValueOf(got).IsZero() {
		t.Fatalf("expected exact malformed Sunday validation error, got %#v, %v", got, err)
	}
	after, err := services.editorQuery.GetReadRecord(context.Background(), "anime-1")
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

// TestSaveAnimeEditorCommandDTOPreservesPlacementsKeyPresence pins the wire
// contract that carries "did the client touch the schedule?": encoding/json leaves
// the Placements pointer nil exactly when the key was absent, and toDomain must
// hand that pointer through unchanged. Rebuilding the slice here instead is what
// promoted "untouched" into "clear every scheduled day" and wiped real schedules.
func TestSaveAnimeEditorCommandDTOPreservesPlacementsKeyPresence(t *testing.T) {
	tests := []struct {
		name      string
		patchJSON string
		wantSet   bool
		wantDays  int
	}{
		{name: "key absent leaves the schedule untouched", patchJSON: `{"name":"Frieren"}`, wantSet: false, wantDays: 0},
		{name: "empty array is a deliberate clear", patchJSON: `{"placements":[]}`, wantSet: true, wantDays: 0},
		{name: "populated array overwrites", patchJSON: `{"placements":[{"day":"Lunes","order":2}]}`, wantSet: true, wantDays: 1},
		{name: "explicit null leaves the schedule untouched", patchJSON: `{"placements":null}`, wantSet: false, wantDays: 0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var dto SaveAnimeEditorCommandDTO
			if err := json.Unmarshal([]byte(`{"animeId":"a","baseModifiedAt":1,"patch":`+test.patchJSON+`}`), &dto); err != nil {
				t.Fatalf("decode command: %v", err)
			}
			command, err := dto.toDomain()
			if err != nil {
				t.Fatalf("to domain: %v", err)
			}
			if (command.Patch.Placements != nil) != test.wantSet {
				t.Fatalf("placements set: got %v want %v", command.Patch.Placements != nil, test.wantSet)
			}
			if test.wantSet && len(*command.Patch.Placements) != test.wantDays {
				t.Fatalf("days: got %d want %d", len(*command.Patch.Placements), test.wantDays)
			}
		})
	}
}
