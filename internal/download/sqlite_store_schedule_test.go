package download

import (
	"context"
	"testing"
)

func TestSQLiteStoreScheduleConfigRoundTrips(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	cfg := ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "03:30", Enabled: true}
	if err := store.SetScheduleConfig(ctx, cfg); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}
	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.Mode != cfg.Mode || got.DailyTimeHHMM != cfg.DailyTimeHHMM || got.Enabled != cfg.Enabled {
		t.Fatalf("expected round-tripped config %#v, got %#v", cfg, got)
	}
	if err := store.MarkScheduleRun(ctx, 1000, "ok", 2000); err != nil {
		t.Fatalf("MarkScheduleRun: %v", err)
	}
	got, err = store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig after mark: %v", err)
	}
	if got.LastRunAtMs != 1000 || got.LastRunStatus != "ok" || got.NextRunAtMs != 2000 {
		t.Fatalf("expected MarkScheduleRun fields to persist, got %#v", got)
	}
}

func TestSQLiteStoreGetScheduleConfigReturnsDisabledDefaultWhenNeverSet(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	got, err := store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.Enabled || got.EnabledWeekdays != 127 {
		t.Fatalf("unexpected default schedule config: %#v", got)
	}
}

func TestSQLiteStoreGetScheduleConfigDefaultsEnabledWeekdaysTo127WhenColumnIsNull(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (id, mode, daily_time_hhmm, enabled)
		VALUES (1, 'in_process', '09:00', 1)
	`); err != nil {
		t.Fatalf("insert legacy-shaped row: %v", err)
	}
	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.EnabledWeekdays != 127 {
		t.Fatalf("expected EnabledWeekdays = 127 for a NULL column, got %d", got.EnabledWeekdays)
	}
}

func TestSQLiteStoreScheduleConfigEnabledWeekdaysRoundTripsArbitraryMask(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	const mask byte = (1 << 4) | (1 << 5) | (1 << 6) | (1 << 0)
	if err := store.SetScheduleConfig(ctx, ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true, EnabledWeekdays: mask}); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}
	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.EnabledWeekdays != mask {
		t.Fatalf("expected EnabledWeekdays = %d, got %d", mask, got.EnabledWeekdays)
	}
}

func TestSQLiteStoreScheduleConfigEnabledWeekdaysRoundTripsEmptyMask(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.SetScheduleConfig(ctx, ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true, EnabledWeekdays: 0}); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}
	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.EnabledWeekdays != 0 {
		t.Fatalf("expected EnabledWeekdays = 0 (explicit empty mask), got %d", got.EnabledWeekdays)
	}
}
