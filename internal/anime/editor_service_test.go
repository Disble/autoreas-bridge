package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

func TestEditorServiceSaveAppliesTypedNullableAndStructuredPatchMatrix(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":2,"estado":0,"activo":true,"totalcap":12,"tipo":0,"pagina":"https://example.test/old","carpeta":"C:/Anime/Frieren","fechaEstreno":null,"duracion":24,"origen":"manga","generos":null,"estudios":null,"dias":[{"dia":"Lunes","orden":1}],"portada":{"type":"url","path":"old.jpg","future":{"keep":true}},"unknown":{"keep":true}}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	total := 13
	kind := 1
	duration := 90
	genres := []string{"Fantasy"}
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{
		AnimeID: "anime-editor", BaseModifiedAt: 1000,
		Patch: anime.EditorPatch{
			TotalEpisodes: anime.EditorNullableIntPatch{Present: true, Value: total},
			Kind:          anime.EditorNullableIntPatch{Present: true, Value: kind},
			Duration:      anime.EditorNullableIntPatch{Present: true, Value: duration},
			PremieredAt:   anime.EditorNullableTimePatch{Present: true, UnixMilli: 1710000000123},
			Genres:        &genres,
			Studios:       anime.EditorStudiosPatch{Present: true, Clear: true},
			Cover: anime.EditorCoverPatch{Present: true, Type: "file", Path: "new.jpg", Raw: map[string]json.RawMessage{
				"future": json.RawMessage(`{"edited":true}`),
			}},
			Placements: []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 1}},
		},
	})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("save full editor matrix: result=%+v err=%v", result, err)
	}
	fields := decodeJSONFields(t, writer.payload)
	assertJSONFieldsEqual(t, fields, map[string]string{
		"totalcap": "13", "tipo": "1", "duracion": "90", "fechaEstreno": `{"$$date":1710000000123}`,
		"generos": `["Fantasy"]`, "estudios": "null", "dias": `[{"dia":"Viernes","orden":1}]`,
		"portada": `{"type":"file","path":"new.jpg","future":{"edited":true}}`, "unknown": `{"keep":true}`,
	})
}

func TestEditorServiceSaveRejectsMalformedPatchShapesAndInvalidValuesBeforeWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":2,"estado":0,"activo":true,"totalcap":12}`, 1000)
	tests := []struct {
		name  string
		patch anime.EditorPatch
	}{
		{name: "non finite progress", patch: anime.EditorPatch{Progress: float64Pointer(math.NaN())}},
		{name: "negative total", patch: anime.EditorPatch{TotalEpisodes: anime.EditorNullableIntPatch{Present: true, Value: -1}}},
		{name: "unsupported type", patch: anime.EditorPatch{Kind: anime.EditorNullableIntPatch{Present: true, Value: 9}}},
		{name: "zero duration", patch: anime.EditorPatch{Duration: anime.EditorNullableIntPatch{Present: true, Value: 0}}},
		{name: "invalid date", patch: anime.EditorPatch{PremieredAt: anime.EditorNullableTimePatch{Present: true, UnixMilli: -1}}},
		{name: "clear with value", patch: anime.EditorPatch{TotalEpisodes: anime.EditorNullableIntPatch{Present: true, Clear: true, Value: 12}}},
		{name: "omitted with value", patch: anime.EditorPatch{Page: anime.EditorNullableStringPatch{Value: "https://example.test"}}},
		{name: "forbidden ownership", patch: anime.EditorPatch{ForbiddenFields: []string{"modified_at"}}},
	}
	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: test.patch}); err == nil {
				t.Fatalf("expected %s to be rejected", test.name)
			}
		})
	}
	if writer.calls != 0 {
		t.Fatalf("invalid editor patches must not write, got %d", writer.calls)
	}
}

func TestEditorServiceSaveCannotReactivateInactiveAnime(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":2,"activo":false}`, 1000)
	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	active := true
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Active: &active}})
	if err == nil || writer.calls != 0 {
		t.Fatalf("general save reactivated inactive anime: err=%v writes=%d", err, writer.calls)
	}
}

func TestEditorServiceSaveClearsPremiereDateAndCoverWithoutFlatteningCoverObject(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":2,"activo":true,"fechaEstreno":{"$$date":1710000000123},"portada":{"type":"file","path":"cover.jpg","future":{"keep":true}}}`, 1000)
	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{
		PremieredAt: anime.EditorNullableTimePatch{Present: true, Clear: true},
		Cover:       anime.EditorCoverPatch{Present: true, Clear: true},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("clear editor metadata: result=%+v err=%v", result, err)
	}
	fields := decodeJSONFields(t, writer.payload)
	assertJSONFieldsEqual(t, fields, map[string]string{
		"fechaEstreno": "null",
		"portada":      `{"type":"file","path":"","future":{"keep":true}}`,
	})
}

func TestEditorServiceSavePublishesExactlyOnceOnlyAfterAcceptedWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":2,"activo":true}`, 1000)
	writer := &stubAnimeWriter{}
	publisher := &editorRecordingPublisher{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	name := "Frieren Beyond"
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Name: &name}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("accepted editor save: result=%+v err=%v", result, err)
	}
	if writer.calls != 1 || len(publisher.events()) != 1 {
		t.Fatalf("accepted editor save must write/publish exactly once: writes=%d events=%d", writer.calls, len(publisher.events()))
	}

	blank := " "
	if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 2000, Patch: anime.EditorPatch{Name: &blank}}); err == nil {
		t.Fatal("expected invalid follow-up save to fail")
	}
	if writer.calls != 1 || len(publisher.events()) != 1 {
		t.Fatalf("invalid editor save emitted side effects: writes=%d events=%d", writer.calls, len(publisher.events()))
	}
}

func TestEditorServiceSaveInfrastructureFailureDoesNotPublish(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":2,"activo":true}`, 1000)
	writer := &stubAnimeWriter{err: errors.New("disk unavailable")}
	publisher := &editorRecordingPublisher{}
	service := anime.NewEditorService(store, writer)
	service.SetDeps(anime.WriteServiceDeps{Publisher: publisher})
	name := "Frieren Beyond"
	if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Name: &name}}); err == nil {
		t.Fatal("expected infrastructure failure")
	}
	if writer.calls != 1 || len(publisher.events()) != 0 {
		t.Fatalf("failed editor save publication mismatch: writes=%d events=%d", writer.calls, len(publisher.events()))
	}
}

type editorRecordingPublisher struct{ recorded []events.Event }

func (p *editorRecordingPublisher) Publish(event events.Event) {
	p.recorded = append(p.recorded, event)
}

// events returns the publisher's recorded events.
func (p *editorRecordingPublisher) events() []events.Event {
	return append([]events.Event{}, p.recorded...)
}

// float64Pointer returns a pointer to a float test value.
func float64Pointer(value float64) *float64 { return &value }

// assertJSONFieldsEqual compares selected JSON fields in a test payload.
func assertJSONFieldsEqual(t *testing.T, fields map[string]json.RawMessage, expected map[string]string) {
	t.Helper()
	for key, value := range expected {
		if !jsonValueEqual(t, fields[key], []byte(value)) {
			t.Fatalf("field %s mismatch: got %s want %s", key, fields[key], value)
		}
	}
}

func TestEditorServiceSavePreservesUnknownFieldsAndStructuredMetadata(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{
		"_id":"anime-editor",
		"nombre":"Frieren",
		"nrocapvisto":12.5,
		"estado":0,
		"activo":true,
		"pagina":"https://anime.example/frieren",
		"carpeta":"C:/Anime/Frieren",
		"estudios":["Madhouse","TOHO animation STUDIO"],
		"portada":{"type":"url","path":"C:/covers/frieren.jpg","future":"keep"},
		"future":{"nested":true}
	}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	name := "Frieren Director's Cut"
	origin := "novel"
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{
		AnimeID:        "anime-editor",
		BaseModifiedAt: 1000,
		Patch: anime.EditorPatch{
			Name:   &name,
			Origin: anime.EditorNullableStringPatch{Present: true, Value: origin},
		},
	})
	if err != nil {
		t.Fatalf("save editor anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied || result.ModifiedAt != 1710000000123 {
		t.Fatalf("unexpected save result: %+v", result)
	}
	fields := decodeJSONFields(t, writer.payload)
	if !jsonValueEqual(t, fields["future"], []byte(`{"nested":true}`)) {
		t.Fatalf("expected unknown field to survive, got %s", fields["future"])
	}
	if !jsonValueEqual(t, fields["estudios"], []byte(`["Madhouse","TOHO animation STUDIO"]`)) {
		t.Fatalf("expected estudios array to survive untouched, got %s", fields["estudios"])
	}
	if !jsonValueEqual(t, fields["portada"], []byte(`{"future":"keep","path":"C:/covers/frieren.jpg","type":"url"}`)) {
		t.Fatalf("expected portada object to survive untouched, got %s", fields["portada"])
	}
	if !jsonValueEqual(t, fields["origen"], []byte(`"novel"`)) {
		t.Fatalf("expected origin to update, got %s", fields["origen"])
	}
	if !jsonValueEqual(t, fields["nombre"], []byte(`"Frieren Director's Cut"`)) {
		t.Fatalf("expected nombre to update, got %s", fields["nombre"])
	}
}

func TestEditorServiceSaveReturnsConflictWithoutWriteOnStaleBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts})

	name := "Frieren Director's Cut"
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{
		AnimeID:        "anime-editor",
		BaseModifiedAt: 999,
		Patch:          anime.EditorPatch{Name: &name},
	})
	if err != nil {
		t.Fatalf("save stale editor anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeConflict || result.ModifiedAt != 1000 {
		t.Fatalf("unexpected stale result: %+v", result)
	}
	if writer.calls != 0 {
		t.Fatalf("expected zero writes on stale base, got %d", writer.calls)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict, got %d", len(conflicts.inserted))
	}
}

func TestEditorServiceSaveRejectsBlankTitleWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	blank := "   "
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{
		AnimeID:        "anime-editor",
		BaseModifiedAt: 1000,
		Patch:          anime.EditorPatch{Name: &blank},
	})
	if err == nil {
		t.Fatal("expected blank title to be rejected")
	}
	if writer.calls != 0 {
		t.Fatalf("blank title must not write, got %d writes", writer.calls)
	}
}

func TestEditorServiceSaveRejectsUnsupportedStatusWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	status := 9
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Status: &status}})
	if err == nil || !strings.Contains(err.Error(), "unsupported status") {
		t.Fatalf("expected unsupported status rejection, got %v", err)
	}
	if writer.calls != 0 {
		t.Fatalf("unsupported status must not write, got %d writes", writer.calls)
	}
}

func TestEditorServiceSaveRejectsNegativeProgressWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	progress := -1.0
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Progress: &progress}})
	if err == nil || !strings.Contains(err.Error(), "progress cannot be negative") {
		t.Fatalf("expected negative progress rejection, got %v", err)
	}
	if writer.calls != 0 {
		t.Fatalf("negative progress must not write, got %d writes", writer.calls)
	}
}

func TestEditorServiceSaveRejectsUnsafeURLAndFolderWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{
		AnimeID:        "anime-editor",
		BaseModifiedAt: 1000,
		Patch: anime.EditorPatch{
			Page:   anime.EditorNullableStringPatch{Present: true, Value: "ftp://example.invalid/frieren"},
			Folder: anime.EditorNullableStringPatch{Present: true, Value: `\\server\share\frieren`},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "unsafe page url") {
		t.Fatalf("expected unsafe page url rejection, got %v", err)
	}
	if writer.calls != 0 {
		t.Fatalf("unsafe page/folder must not write, got %d writes", writer.calls)
	}
}

func TestEditorServiceDeactivateWritesActivoFalseWithoutDeletingRecord(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"_id":"anime-editor","nombre":"Frieren","nrocapvisto":12.5,"estado":0,"activo":true}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	result, err := service.Deactivate(ctx, "anime-editor", 1000)
	if err != nil {
		t.Fatalf("deactivate anime: %v", err)
	}
	if result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("unexpected deactivate result: %+v", result)
	}
	fields := decodeJSONFields(t, writer.payload)
	if !jsonValueEqual(t, fields["activo"], []byte(`false`)) {
		t.Fatalf("expected activo=false, got %s", fields["activo"])
	}
	if _, ok := fields["$$deleted"]; ok {
		t.Fatalf("deactivate must not tombstone the record: %s", fields["$$deleted"])
	}
}
