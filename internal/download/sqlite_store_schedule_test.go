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
	cfg := ScheduleConfig{
		Mode:                    "in_process",
		DailyTimeHHMM:           "03:30",
		Enabled:                 true,
		LastSettledLocalDate:    "2026-07-24",
		LastSettlementReason:    ScheduleSettlementIgnored,
		LastMissedAttemptDate:   "2026-07-23",
		LastMissedAttemptStatus: "partial",
	}
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
	if got.LastSettledLocalDate != cfg.LastSettledLocalDate || got.LastSettlementReason != cfg.LastSettlementReason {
		t.Fatalf("expected settlement ledger %#v, got %#v", cfg, got)
	}
	if got.LastMissedAttemptDate != cfg.LastMissedAttemptDate || got.LastMissedAttemptStatus != cfg.LastMissedAttemptStatus {
		t.Fatalf("expected missed-attempt fields %#v, got %#v", cfg, got)
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
	if got.LastSettledLocalDate != "" || got.LastSettlementReason != "" || got.LastMissedAttemptDate != "" || got.LastMissedAttemptStatus != "" {
		t.Fatalf("expected additive columns to default empty, got %#v", got)
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

func TestSQLiteStoreApplyScheduleSettlementIgnorePreservesFactualLastRunFields(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.SetScheduleConfig(ctx, ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true, EnabledWeekdays: 127}); err != nil {
		t.Fatalf("SetScheduleConfig: %v", err)
	}
	if err := store.MarkScheduleRun(ctx, 1000, "ok", 1500); err != nil {
		t.Fatalf("MarkScheduleRun: %v", err)
	}

	result, err := store.ApplyScheduleSettlement(ctx, ScheduleSettlementRequest{
		LocalDate:   "2026-07-26",
		Reason:      ScheduleSettlementIgnored,
		NextRunAtMs: 3000,
	})
	if err != nil {
		t.Fatalf("ApplyScheduleSettlement: %v", err)
	}
	if result.Outcome != ScheduleSettlementApplied {
		t.Fatalf("settlement outcome = %q, want %q", result.Outcome, ScheduleSettlementApplied)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.LastRunAtMs != 1000 || got.LastRunStatus != "ok" {
		t.Fatalf("ignore must preserve factual last_run_* fields, got %#v", got)
	}
	if got.NextRunAtMs != 3000 || got.LastSettledLocalDate != "2026-07-26" || got.LastSettlementReason != ScheduleSettlementIgnored {
		t.Fatalf("ignore settlement fields mismatch, got %#v", got)
	}
}

func TestSQLiteStoreApplyScheduleSettlementSupportsAtomicSuccessfulRunNowFacts(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	result, err := store.ApplyScheduleSettlement(ctx, ScheduleSettlementRequest{
		LocalDate:         "2026-07-26",
		Reason:            ScheduleSettlementRunNow,
		NextRunAtMs:       4000,
		SuccessfulRunAtMs: new(int64(2500)),
		SuccessfulStatus:  RunStatusOK,
	})
	if err != nil {
		t.Fatalf("ApplyScheduleSettlement: %v", err)
	}
	if result.Outcome != ScheduleSettlementApplied {
		t.Fatalf("settlement outcome = %q, want %q", result.Outcome, ScheduleSettlementApplied)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.LastRunAtMs != 2500 || got.LastRunStatus != RunStatusOK {
		t.Fatalf("successful run-now facts were not persisted atomically, got %#v", got)
	}
	if got.NextRunAtMs != 4000 || got.LastSettledLocalDate != "2026-07-26" || got.LastSettlementReason != ScheduleSettlementRunNow {
		t.Fatalf("successful run-now settlement mismatch, got %#v", got)
	}
}

func TestSQLiteStoreApplyScheduleSettlementIsMonotonicAndIdempotent(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if _, err := store.ApplyScheduleSettlement(ctx, ScheduleSettlementRequest{
		LocalDate:   "2026-07-27",
		Reason:      ScheduleSettlementScheduled,
		NextRunAtMs: 5000,
	}); err != nil {
		t.Fatalf("first ApplyScheduleSettlement: %v", err)
	}

	idempotent, err := store.ApplyScheduleSettlement(ctx, ScheduleSettlementRequest{
		LocalDate:   "2026-07-27",
		Reason:      ScheduleSettlementScheduled,
		NextRunAtMs: 6000,
	})
	if err != nil {
		t.Fatalf("idempotent ApplyScheduleSettlement: %v", err)
	}
	if idempotent.Outcome != ScheduleSettlementIdempotent {
		t.Fatalf("equal-date outcome = %q, want %q", idempotent.Outcome, ScheduleSettlementIdempotent)
	}

	obsolete, err := store.ApplyScheduleSettlement(ctx, ScheduleSettlementRequest{
		LocalDate:   "2026-07-26",
		Reason:      ScheduleSettlementIgnored,
		NextRunAtMs: 7000,
	})
	if err != nil {
		t.Fatalf("obsolete ApplyScheduleSettlement: %v", err)
	}
	if obsolete.Outcome != ScheduleSettlementObsolete {
		t.Fatalf("older-date outcome = %q, want %q", obsolete.Outcome, ScheduleSettlementObsolete)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.LastSettledLocalDate != "2026-07-27" || got.NextRunAtMs != 5000 {
		t.Fatalf("obsolete/idempotent settlements must not rewrite ledger state, got %#v", got)
	}
}

func TestSQLiteStoreRecordMissedStartupAttemptPersistsSeparateUnresolvedTruth(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if err := store.MarkScheduleRun(ctx, 1000, RunStatusOK, 2000); err != nil {
		t.Fatalf("MarkScheduleRun: %v", err)
	}
	if err := store.RecordMissedStartupAttempt(ctx, "2026-07-26", RunStatusPartial); err != nil {
		t.Fatalf("RecordMissedStartupAttempt: %v", err)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.LastMissedAttemptDate != "2026-07-26" || got.LastMissedAttemptStatus != RunStatusPartial {
		t.Fatalf("expected unresolved attempt truth, got %#v", got)
	}
	if got.LastRunAtMs != 1000 || got.LastRunStatus != RunStatusOK {
		t.Fatalf("recording a failed missed attempt must not rewrite factual last_run_* fields, got %#v", got)
	}
}

//nolint:gocognit // integration test exercising multiple persistence round-trips
func TestSQLiteStoreSchedulePreferenceSavePreservesMissedDayTruthAcrossStoreRestart(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                    string
		prepare                 func(*SQLiteStore, context.Context) error
		wantNextRunAtMs         int64
		wantSettledLocalDate    string
		wantSettlementReason    ScheduleSettlementReason
		wantMissedAttemptDate   string
		wantMissedAttemptStatus string
	}{
		{
			name: "ignore dismissal",
			prepare: func(store *SQLiteStore, ctx context.Context) error {
				_, err := store.ApplyScheduleSettlement(ctx, ScheduleSettlementRequest{
					LocalDate:   "2026-07-26",
					Reason:      ScheduleSettlementIgnored,
					NextRunAtMs: 3000,
				})
				return err
			},
			wantNextRunAtMs:      3000,
			wantSettledLocalDate: "2026-07-26",
			wantSettlementReason: ScheduleSettlementIgnored,
		},
		{
			name: "failed run now attempt",
			prepare: func(store *SQLiteStore, ctx context.Context) error {
				return store.RecordMissedStartupAttempt(ctx, "2026-07-26", RunStatusPartial)
			},
			wantNextRunAtMs:         1500,
			wantMissedAttemptDate:   "2026-07-26",
			wantMissedAttemptStatus: RunStatusPartial,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := openTestBridgeDB(t)
			store := NewSQLiteStore(db)
			ctx := context.Background()

			if err := store.SetScheduleConfig(ctx, ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "09:00", Enabled: true, EnabledWeekdays: 127}); err != nil {
				t.Fatalf("seed schedule config: %v", err)
			}
			if err := store.MarkScheduleRun(ctx, 1000, RunStatusOK, 1500); err != nil {
				t.Fatalf("MarkScheduleRun: %v", err)
			}
			if err := tt.prepare(store, ctx); err != nil {
				t.Fatalf("prepare missed-day truth: %v", err)
			}

			if err := store.SetScheduleConfig(ctx, ScheduleConfig{Mode: "in_process", DailyTimeHHMM: "10:30", Enabled: false, EnabledWeekdays: 0}); err != nil {
				t.Fatalf("save schedule preferences: %v", err)
			}

			got, err := NewSQLiteStore(db).GetScheduleConfig(ctx)
			if err != nil {
				t.Fatalf("load schedule config after restart: %v", err)
			}
			if got.DailyTimeHHMM != "10:30" || got.Enabled || got.EnabledWeekdays != 0 {
				t.Fatalf("schedule preferences did not update, got %#v", got)
			}
			if got.LastRunAtMs != 1000 || got.LastRunStatus != RunStatusOK || got.NextRunAtMs != tt.wantNextRunAtMs {
				t.Fatalf("schedule preference save rewrote factual run fields, got %#v", got)
			}
			if got.LastSettledLocalDate != tt.wantSettledLocalDate || got.LastSettlementReason != tt.wantSettlementReason {
				t.Fatalf("schedule preference save rewrote settlement truth, got %#v", got)
			}
			if got.LastMissedAttemptDate != tt.wantMissedAttemptDate || got.LastMissedAttemptStatus != tt.wantMissedAttemptStatus {
				t.Fatalf("schedule preference save rewrote missed-attempt truth, got %#v", got)
			}
		})
	}
}

func TestSQLiteStoreLegacyRowKeepsActualRunFactsWithoutBackfilledSettlement(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()

	if _, err := db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (
			id,
			mode,
			daily_time_hhmm,
			enabled,
			last_run_at_ms,
			last_run_status,
			next_run_at_ms,
			enabled_weekdays,
			last_settled_local_date,
			last_settlement_reason,
			last_missed_attempt_local_date,
			last_missed_attempt_status
		) VALUES (1, 'in_process', '21:00', 1, 1721988000000, 'ok', 1722074400000, 127, '', '', '', '')
	`); err != nil {
		t.Fatalf("insert legacy-shaped row: %v", err)
	}

	got, err := store.GetScheduleConfig(ctx)
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if got.LastRunAtMs != 1721988000000 || got.LastRunStatus != RunStatusOK {
		t.Fatalf("expected upgrade facts to survive unchanged, got %#v", got)
	}
	if got.LastSettledLocalDate != "" || got.LastSettlementReason != "" {
		t.Fatalf("legacy rows must stay unbackfilled until real settlement occurs, got %#v", got)
	}
}
