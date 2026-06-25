package download

import "testing"

// TestScheduleConfigHasEnabledWeekdaysField asserts ScheduleConfig carries a 7-bit weekday
// mask (design.md "Weekday encoding = 7-bit bitmask, bit i = time.Weekday(i)"; bit0=Sunday ..
// bit6=Saturday, all-days = 127). The zero value MUST compile and default to 0 (callers reading
// a fresh zero-value struct directly, bypassing the store's NULL->127 read-path default, see
// 0 -- the 127 default is a store-layer concern, not a struct-literal concern).
func TestScheduleConfigHasEnabledWeekdaysField(t *testing.T) {
	var cfg ScheduleConfig
	if cfg.EnabledWeekdays != 0 {
		t.Fatalf("expected zero-value EnabledWeekdays = 0, got %d", cfg.EnabledWeekdays)
	}

	cfg.EnabledWeekdays = 127
	if cfg.EnabledWeekdays != 127 {
		t.Fatalf("expected EnabledWeekdays = 127 after assignment, got %d", cfg.EnabledWeekdays)
	}
}
