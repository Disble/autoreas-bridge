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
