package contracts

import (
	"encoding/json"
	"testing"
)

// TestScheduleConfigEnabledWeekdaysRoundTripsThroughJSON asserts the UI-facing ScheduleConfig
// carries EnabledWeekdays as an int with json tag "enabledWeekdays" (design.md "Weekday
// encoding ... Contract contracts.ScheduleConfig: add EnabledWeekdays int `json:"enabledWeekdays"`").
func TestScheduleConfigEnabledWeekdaysRoundTripsThroughJSON(t *testing.T) {
	cfg := ScheduleConfig{
		Mode:            "in_process",
		DailyTimeHHMM:   "09:00",
		Enabled:         true,
		EnabledWeekdays: 127,
	}

	encoded, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}
	if _, ok := raw["enabledWeekdays"]; !ok {
		t.Fatalf("expected JSON key %q in encoded output, got %s", "enabledWeekdays", encoded)
	}

	var decoded ScheduleConfig
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.EnabledWeekdays != 127 {
		t.Fatalf("expected EnabledWeekdays = 127 after round-trip, got %d", decoded.EnabledWeekdays)
	}
}

func TestAnimeEditorRecordRoundTripsThroughJSON(t *testing.T) {
	record := AnimeEditorRecord{
		AnimeID:    "anime-editor",
		ModifiedAt: 1710000000123,
		Frequent: AnimeEditorFrequentFields{
			Name:       "Frieren",
			Status:     0,
			Progress:   12.5,
			Active:     true,
			Placements: []MobileAnimeDay{{Dia: "Viernes", Orden: 2}},
		},
		Details: AnimeEditorDetailFields{
			Studios: AnimeEditorStringListDTO{Kind: AnimeEditorValueKindValue, Values: []string{"Madhouse"}},
			Cover:   AnimeEditorCoverDTO{Kind: AnimeEditorValueKindValue, Type: "url", Path: "C:/covers/frieren.jpg", Raw: map[string]any{"future": true}},
		},
	}

	encoded, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	for _, key := range []string{"animeId", "modifiedAt", "frequent", "details"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("expected JSON key %q in encoded output, got %s", key, encoded)
		}
	}

	var decoded AnimeEditorRecord
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.AnimeID != "anime-editor" || decoded.ModifiedAt != 1710000000123 {
		t.Fatalf("unexpected identity after round-trip: %+v", decoded)
	}
	if decoded.Details.Cover.Kind != AnimeEditorValueKindValue || decoded.Details.Cover.Path != "C:/covers/frieren.jpg" {
		t.Fatalf("expected cover path to survive round-trip, got %+v", decoded.Details.Cover)
	}
	if decoded.Details.Studios.Kind != AnimeEditorValueKindValue || len(decoded.Details.Studios.Values) != 1 {
		t.Fatalf("expected studios to survive round-trip, got %+v", decoded.Details.Studios)
	}
}

func TestAnimeEditorOutcomeContractsCarryAuthorityAndDetails(t *testing.T) {
	record := &AnimeEditorRecord{AnimeID: "anime-1", ModifiedAt: 22}
	board := &AnimeEditorScheduleBoard{OriginAnimeID: "anime-1", BoardModifiedAt: 22}
	results := []any{
		AnimeEditorRecordResult{Outcome: AnimePatchOutcomeApplied, Message: "record loaded", Details: map[string]string{"operation": "get"}, Record: record},
		AnimeEditorSaveResult{Outcome: AnimePatchOutcomeConflict, Message: "stale base", Details: map[string]string{"conflictId": "c-1"}, Record: record},
		AnimeEditorScheduleBoardResult{Outcome: AnimePatchOutcomeApplied, Message: "board loaded", Board: board},
		AnimeEditorScheduleApplyResult{Outcome: AnimePatchOutcomeConflict, Message: "schedule changed", Board: board},
	}
	for _, result := range results {
		encoded, err := json.Marshal(result)
		if err != nil {
			t.Fatalf("marshal editor result: %v", err)
		}
		if !json.Valid(encoded) || !containsJSONKey(encoded, "outcome") || !containsJSONKey(encoded, "message") {
			t.Fatalf("editor result lacks explicit outcome/message: %s", encoded)
		}
	}
}

func containsJSONKey(payload []byte, key string) bool {
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(payload, &fields)
	_, ok := fields[key]
	return ok
}
