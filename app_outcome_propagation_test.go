package main

import (
	"encoding/json"
	"testing"

	"autoreas-bridge/internal/anime"
)

func TestToChapterCommandContractPreservesMutationAuthority(t *testing.T) {
	got := toChapterCommandContract(anime.ChapterCommandResult{
		AnimeID: "anime-1", Outcome: anime.AnimePatchOutcomeConflict,
		ModifiedAt: 2000, ConflictID: "conflict-17",
	})

	if got.Status != "ok" || got.AnimeID != "anime-1" || got.Outcome != string(anime.AnimePatchOutcomeConflict) || got.ModifiedAt != 2000 || got.ConflictID != "conflict-17" {
		t.Fatalf("Wails result dropped mutation authority: %#v", got)
	}
}

func TestToChapterCommandContractPreservesZeroMutationTokenOnJSONWire(t *testing.T) {
	got := toChapterCommandContract(anime.ChapterCommandResult{
		AnimeID: "anime-zero", Outcome: anime.AnimePatchOutcomeConflict,
		ModifiedAt: 0, ConflictID: "conflict-zero",
	})

	payload, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal Wails result: %v", err)
	}
	var wire struct {
		Status     string `json:"status"`
		AnimeID    string `json:"animeId"`
		Outcome    string `json:"outcome"`
		ModifiedAt *int64 `json:"modifiedAt"`
		ConflictID string `json:"conflictId"`
	}
	if err := json.Unmarshal(payload, &wire); err != nil {
		t.Fatalf("decode Wails result: %v", err)
	}
	if wire.Status != "ok" || wire.AnimeID != "anime-zero" || wire.Outcome != string(anime.AnimePatchOutcomeConflict) || wire.ConflictID != "conflict-zero" {
		t.Fatalf("Wails JSON changed mutation authority fields: %s", payload)
	}
	if wire.ModifiedAt == nil || *wire.ModifiedAt != 0 {
		t.Fatalf("Wails JSON must preserve authoritative zero modifiedAt, got %s", payload)
	}
}
