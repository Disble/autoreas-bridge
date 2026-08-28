package anime_test

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

func TestEditorServiceSaveAppliesTypedNullableAndStructuredPatchMatrix(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"status":0,"active":true,"totalEpisodes":12,"kind":0,"sourceUrl":"https://example.test/old","folder":"C:/Anime/Frieren","premieredAt":null,"durationMinutes":24,"origin":"manga","genres":null,"studios":null,"days":[{"day":"Lunes","order":1}],"cover":{"type":"url","path":"old.jpg","future":{"keep":true}},"unknown":{"keep":true}}`, 1000)

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
			Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}},
		},
	})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("save full editor matrix: result=%+v err=%v", result, err)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	fields := decodeJSONFields(t, snapshot.CanonicalJSON)
	assertJSONFieldsEqual(t, fields, map[string]string{
		"totalEpisodes": "13", "kind": "1", "durationMinutes": "90", "premieredAt": `1710000000123`,
		"genres": `["Fantasy"]`, "studios": "null", "days": `[{"day":"Viernes","order":1}]`,
		"cover": `{"type":"file","path":"new.jpg","future":{"edited":true}}`, "unknown": `{"keep":true}`,
	})
}

func TestEditorServiceSaveRejectsMalformedPatchShapesAndInvalidValuesBeforeWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"status":0,"active":true,"totalEpisodes":12}`, 1000)
	tests := []struct {
		name  string
		patch anime.EditorPatch
	}{
		{name: "non finite progress", patch: anime.EditorPatch{Progress: new(math.NaN())}},
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
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("invalid editor patches must not finalize a write: %#v, %v", current, err)
	}
}

func TestEditorServiceSaveCannotReactivateInactiveAnime(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":false}`, 1000)
	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	active := true
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Active: &active}})
	if err == nil {
		t.Fatalf("general save reactivated inactive anime: err=%v", err)
	}
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("general save must not finalize a write when rejected: %#v, %v", current, err)
	}
}

func TestEditorServiceSaveClearsPremiereDateAndCoverWithoutFlatteningCoverObject(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true,"premieredAt":1710000000123,"cover":{"type":"file","path":"cover.jpg","future":{"keep":true}}}`, 1000)
	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{
		PremieredAt: anime.EditorNullableTimePatch{Present: true, Clear: true},
		Cover:       anime.EditorCoverPatch{Present: true, Clear: true},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("clear editor metadata: result=%+v err=%v", result, err)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	fields := decodeJSONFields(t, snapshot.CanonicalJSON)
	assertJSONFieldsEqual(t, fields, map[string]string{
		"premieredAt": "null",
		"cover":       `{"type":"file","path":"","future":{"keep":true}}`,
	})
}

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
		"id":"anime-editor",
		"name":"Frieren",
		"episodesWatched":12.5,
		"status":0,
		"active":true,
		"sourceUrl":"https://anime.example/frieren",
		"folder":"C:/Anime/Frieren",
		"studios":["Madhouse","TOHO animation STUDIO"],
		"cover":{"type":"url","path":"C:/covers/frieren.jpg","future":"keep"},
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
	snapshot, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	fields := decodeJSONFields(t, snapshot.CanonicalJSON)
	if !jsonValueEqual(t, fields["future"], []byte(`{"nested":true}`)) {
		t.Fatalf("expected unknown field to survive, got %s", fields["future"])
	}
	if !jsonValueEqual(t, fields["studios"], []byte(`["Madhouse","TOHO animation STUDIO"]`)) {
		t.Fatalf("expected studios array to survive untouched, got %s", fields["studios"])
	}
	if !jsonValueEqual(t, fields["cover"], []byte(`{"future":"keep","path":"C:/covers/frieren.jpg","type":"url"}`)) {
		t.Fatalf("expected cover object to survive untouched, got %s", fields["cover"])
	}
	if !jsonValueEqual(t, fields["origin"], []byte(`"novel"`)) {
		t.Fatalf("expected origin to update, got %s", fields["origin"])
	}
	if !jsonValueEqual(t, fields["name"], []byte(`"Frieren Director's Cut"`)) {
		t.Fatalf("expected name to update, got %s", fields["name"])
	}
}

func TestEditorServiceSaveReturnsConflictWithoutWriteOnStaleBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":12.5}`, 1000)

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
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected one recorded conflict, got %d", len(conflicts.inserted))
	}
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("stale base must not finalize a write: %#v, %v", current, err)
	}
}

func TestEditorServiceSaveRejectsBlankTitleWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":12.5}`, 1000)

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
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("blank title must not finalize a write: %#v, %v", current, err)
	}
}

func TestEditorServiceSaveRejectsUnsupportedStatusWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	status := 9
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Status: &status}})
	if err == nil || !strings.Contains(err.Error(), "unsupported status") {
		t.Fatalf("expected unsupported status rejection, got %v", err)
	}
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("unsupported status must not finalize a write: %#v, %v", current, err)
	}
}

func TestEditorServiceSaveRejectsNegativeProgressWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":12.5}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewEditorService(store, writer)
	progress := -1.0
	_, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{Progress: &progress}})
	if err == nil || !strings.Contains(err.Error(), "progress cannot be negative") {
		t.Fatalf("expected negative progress rejection, got %v", err)
	}
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("negative progress must not finalize a write: %#v, %v", current, err)
	}
}

func TestEditorServiceSaveRejectsUnsafeURLAndFolderWithoutWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":12.5}`, 1000)

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
	current, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil || current.ModifiedAt != 1000 {
		t.Fatalf("unsafe page/folder must not finalize a write: %#v, %v", current, err)
	}
}

func TestEditorServiceDeactivateWritesActivoFalseWithoutDeletingRecord(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","episodesWatched":12.5,"status":0,"active":true}`, 1000)

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
	snapshot, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	fields := decodeJSONFields(t, snapshot.CanonicalJSON)
	if !jsonValueEqual(t, fields["active"], []byte(`false`)) {
		t.Fatalf("expected active=false, got %s", fields["active"])
	}
	if _, ok := fields["$$deleted"]; ok {
		t.Fatalf("deactivate must not tombstone the record: %s", fields["$$deleted"])
	}
}
