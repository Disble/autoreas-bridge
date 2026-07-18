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

// TestAnimeEditorNullableIntDTOEmitsZeroValue guards the discriminated-union
// contract at the Go->JS serialization boundary: when Kind is "value", the
// numeric Value MUST appear in the JSON even when it is 0. A dropped zero (the
// classic `omitempty` bug) makes tipo=0 ("Anime (TV)") — the most common type —
// indistinguishable from "missing" on the frontend, breaking the editor's Type
// field and forcing an endless no_op save loop.
func TestAnimeEditorNullableIntDTOEmitsZeroValue(t *testing.T) {
	dto := AnimeEditorNullableIntDTO{Kind: AnimeEditorValueKindValue, Value: 0}

	encoded, err := json.Marshal(dto)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	value, ok := raw["value"]
	if !ok {
		t.Fatalf("expected explicit %q key for a value-kind zero, got %s", "value", encoded)
	}
	if string(value) != "0" {
		t.Fatalf("expected value 0 to survive marshaling, got %s", value)
	}
}

// TestAnimeEditorNullableStringDTOEmitsEmptyValue guards the same boundary for
// the nullable string field: a value-kind empty string must serialize
// explicitly so it stays distinct from a missing/null field.
func TestAnimeEditorNullableStringDTOEmitsEmptyValue(t *testing.T) {
	dto := AnimeEditorNullableStringDTO{Kind: AnimeEditorValueKindValue, Value: ""}

	encoded, err := json.Marshal(dto)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	if _, ok := raw["value"]; !ok {
		t.Fatalf("expected explicit %q key for a value-kind empty string, got %s", "value", encoded)
	}
}

// TestAnimeEditorNullableTimeDTOEmitsZeroUnixMilli guards the same boundary for
// the nullable time field: a value-kind epoch of 0 must serialize explicitly.
func TestAnimeEditorNullableTimeDTOEmitsZeroUnixMilli(t *testing.T) {
	dto := AnimeEditorNullableTimeDTO{Kind: AnimeEditorValueKindValue, UnixMilli: 0}

	encoded, err := json.Marshal(dto)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal raw map: %v", err)
	}
	if _, ok := raw["unixMilli"]; !ok {
		t.Fatalf("expected explicit %q key for a value-kind zero epoch, got %s", "unixMilli", encoded)
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

// containsJSONKey reports whether a JSON object contains the requested key.
func containsJSONKey(payload []byte, key string) bool {
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(payload, &fields)
	_, ok := fields[key]
	return ok
}
