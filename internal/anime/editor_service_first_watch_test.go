package anime_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
)

// TestEditorServiceSaveDerivesFirstWatchPremiere pins the editor boundary: a
// save derives premieredAt only when a preexisting, still-undated anime crosses
// from unwatched to watched. A manual premieredAt (set or cleared) is ignored;
// the DTO field is retained only until P2b reworks manual editing.
func TestEditorServiceSaveDerivesFirstWatchPremiere(t *testing.T) {
	const stamped = int64(1600000000000)

	tests := []struct {
		name          string
		seed          string
		patch         anime.EditorPatch
		wantPremiered *int64
	}{
		{
			name:          "zero to positive derives the save instant",
			seed:          `{"id":"anime-editor","name":"Frieren","episodesWatched":0,"active":true}`,
			patch:         anime.EditorPatch{Progress: new(1.0)},
			wantPremiered: new(int64(1710000000123)),
		},
		{
			name:  "legacy positive undated stays undated",
			seed:  `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true}`,
			patch: anime.EditorPatch{Progress: new(3.0)},
		},
		{
			name:          "recorded date is preserved",
			seed:          `{"id":"anime-editor","name":"Frieren","episodesWatched":3,"active":true,"premieredAt":1600000000000}`,
			patch:         anime.EditorPatch{Progress: new(4.0)},
			wantPremiered: new(stamped),
		},
		{
			name:  "manual premieredAt is ignored",
			seed:  `{"id":"anime-editor","name":"Frieren","episodesWatched":2,"active":true}`,
			patch: anime.EditorPatch{PremieredAt: anime.EditorNullableTimePatch{Present: true, UnixMilli: 1500000000000}},
		},
		{
			name:          "manual clear cannot remove a recorded date",
			seed:          `{"id":"anime-editor","name":"Frieren","episodesWatched":3,"active":true,"premieredAt":1600000000000}`,
			patch:         anime.EditorPatch{Progress: new(4.0), PremieredAt: anime.EditorNullableTimePatch{Present: true, Clear: true}},
			wantPremiered: new(stamped),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assertEditorSaveFirstWatchPremiere(t, tc.seed, tc.patch, tc.wantPremiered)
		})
	}
}

// assertEditorSaveFirstWatchPremiere runs one editor save and checks the derived
// first-watch instant, kept as a helper so the table stays below the cognitive
// complexity gate.
func assertEditorSaveFirstWatchPremiere(t *testing.T, seed string, patch anime.EditorPatch, wantPremiered *int64) {
	t.Helper()
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", seed, 1000)
	service := anime.NewEditorService(store, &stubAnimeWriter{})
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if _, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: patch}); err != nil {
		t.Fatalf("save editor anime: %v", err)
	}
	snapshot, err := store.GetSnapshot(ctx, "anime-editor")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	got := decodeJSONFields(t, snapshot.CanonicalJSON)["premieredAt"]
	if wantPremiered == nil {
		if len(got) > 0 && string(got) != "null" {
			t.Fatalf("expected no premieredAt, got %s", got)
		}
		return
	}
	var millis int64
	if err := json.Unmarshal(got, &millis); err != nil {
		t.Fatalf("unmarshal premieredAt %s: %v", got, err)
	}
	if millis != *wantPremiered {
		t.Fatalf("expected premieredAt %d, got %d", *wantPremiered, millis)
	}
}
