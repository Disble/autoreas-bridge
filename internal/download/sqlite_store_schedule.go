package download

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

const scheduleConfigAllWeekdaysEnabled = 127

// GetScheduleConfig returns the persisted scheduler configuration singleton.
func (s *SQLiteStore) GetScheduleConfig(ctx context.Context) (ScheduleConfig, error) {
	var (
		mode                    string
		dailyTime               sql.NullString
		enabled                 int
		lastRunAtMs             sql.NullInt64
		lastRunStatus           sql.NullString
		nextRunAtMs             sql.NullInt64
		enabledWeekdays         sql.NullInt64
		lastSettledLocalDate    sql.NullString
		lastSettlementReason    sql.NullString
		lastMissedAttemptDate   sql.NullString
		lastMissedAttemptStatus sql.NullString
	)

	err := s.db.QueryRowContext(ctx, `
		SELECT mode, daily_time_hhmm, enabled, last_run_at_ms, last_run_status, next_run_at_ms,
		       enabled_weekdays, last_settled_local_date, last_settlement_reason,
		       last_missed_attempt_local_date, last_missed_attempt_status
		FROM download_schedule_config WHERE id = 1
	`).Scan(
		&mode,
		&dailyTime,
		&enabled,
		&lastRunAtMs,
		&lastRunStatus,
		&nextRunAtMs,
		&enabledWeekdays,
		&lastSettledLocalDate,
		&lastSettlementReason,
		&lastMissedAttemptDate,
		&lastMissedAttemptStatus,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return ScheduleConfig{Mode: "in_process", Enabled: false, EnabledWeekdays: scheduleConfigAllWeekdaysEnabled}, nil
	}
	if err != nil {
		return ScheduleConfig{}, fmt.Errorf("get schedule config: %w", err)
	}

	weekdays := byte(scheduleConfigAllWeekdaysEnabled)
	if enabledWeekdays.Valid {
		weekdays = byte(enabledWeekdays.Int64)
	}

	return ScheduleConfig{
		Mode:                    mode,
		DailyTimeHHMM:           dailyTime.String,
		Enabled:                 enabled != 0,
		LastRunAtMs:             lastRunAtMs.Int64,
		LastRunStatus:           lastRunStatus.String,
		NextRunAtMs:             nextRunAtMs.Int64,
		EnabledWeekdays:         weekdays,
		LastSettledLocalDate:    lastSettledLocalDate.String,
		LastSettlementReason:    ScheduleSettlementReason(lastSettlementReason.String),
		LastMissedAttemptDate:   lastMissedAttemptDate.String,
		LastMissedAttemptStatus: lastMissedAttemptStatus.String,
	}, nil
}

// SetScheduleConfig upserts the scheduler configuration singleton while preserving runtime truth on existing rows.
func (s *SQLiteStore) SetScheduleConfig(ctx context.Context, cfg ScheduleConfig) error {
	mode := cfg.Mode
	if mode == "" {
		mode = "in_process"
	}
	enabled := 0
	if cfg.Enabled {
		enabled = 1
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (
			id, mode, daily_time_hhmm, enabled, enabled_weekdays,
			last_settled_local_date, last_settlement_reason,
			last_missed_attempt_local_date, last_missed_attempt_status
		)
		VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			mode = excluded.mode,
			daily_time_hhmm = excluded.daily_time_hhmm,
			enabled = excluded.enabled,
			enabled_weekdays = excluded.enabled_weekdays
	`, mode, cfg.DailyTimeHHMM, enabled, cfg.EnabledWeekdays, cfg.LastSettledLocalDate, cfg.LastSettlementReason, cfg.LastMissedAttemptDate, cfg.LastMissedAttemptStatus)
	if err != nil {
		return fmt.Errorf("set schedule config: %w", err)
	}
	return nil
}

// MarkScheduleRun records the last completed scheduled execution snapshot.
func (s *SQLiteStore) MarkScheduleRun(ctx context.Context, lastAtMs int64, status string, nextAtMs int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (id, last_run_at_ms, last_run_status, next_run_at_ms)
		VALUES (1, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			last_run_at_ms = excluded.last_run_at_ms,
			last_run_status = excluded.last_run_status,
			next_run_at_ms = excluded.next_run_at_ms
	`, lastAtMs, status, nextAtMs)
	if err != nil {
		return fmt.Errorf("mark schedule run: %w", err)
	}
	return nil
}

// ApplyScheduleSettlement atomically persists a monotonic settlement plus optional factual success fields.
//
//nolint:funlen // 1 line over limit; splitting would fragment a coherent transaction
func (s *SQLiteStore) ApplyScheduleSettlement(ctx context.Context, req ScheduleSettlementRequest) (ScheduleSettlementResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ScheduleSettlementResult{}, fmt.Errorf("begin schedule settlement tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var currentDate string
	err = tx.QueryRowContext(ctx, `
		SELECT last_settled_local_date
		FROM download_schedule_config
		WHERE id = 1
	`).Scan(&currentDate)
	if errors.Is(err, sql.ErrNoRows) {
		if _, err := tx.ExecContext(ctx, `INSERT INTO download_schedule_config (id) VALUES (1)`); err != nil {
			return ScheduleSettlementResult{}, fmt.Errorf("seed schedule config for settlement: %w", err)
		}
		currentDate = ""
	} else if err != nil {
		return ScheduleSettlementResult{}, fmt.Errorf("read current schedule settlement: %w", err)
	}

	switch {
	case currentDate > req.LocalDate:
		if err := tx.Commit(); err != nil {
			return ScheduleSettlementResult{}, fmt.Errorf("commit obsolete schedule settlement: %w", err)
		}
		return ScheduleSettlementResult{Outcome: ScheduleSettlementObsolete}, nil
	case currentDate == req.LocalDate:
		if err := tx.Commit(); err != nil {
			return ScheduleSettlementResult{}, fmt.Errorf("commit idempotent schedule settlement: %w", err)
		}
		return ScheduleSettlementResult{Outcome: ScheduleSettlementIdempotent}, nil
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE download_schedule_config
		SET next_run_at_ms = ?,
			last_settled_local_date = ?,
			last_settlement_reason = ?,
			last_missed_attempt_local_date = '',
			last_missed_attempt_status = '',
			last_run_at_ms = CASE WHEN ? IS NULL THEN last_run_at_ms ELSE ? END,
			last_run_status = CASE WHEN ? = '' THEN last_run_status ELSE ? END
		WHERE id = 1
	`,
		req.NextRunAtMs,
		req.LocalDate,
		req.Reason,
		req.SuccessfulRunAtMs,
		derefInt64(req.SuccessfulRunAtMs),
		req.SuccessfulStatus,
		req.SuccessfulStatus,
	)
	if err != nil {
		return ScheduleSettlementResult{}, fmt.Errorf("update schedule settlement: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return ScheduleSettlementResult{}, fmt.Errorf("commit schedule settlement: %w", err)
	}
	return ScheduleSettlementResult{Outcome: ScheduleSettlementApplied}, nil
}

// RecordMissedStartupAttempt persists the latest unresolved missed-startup terminal truth.
func (s *SQLiteStore) RecordMissedStartupAttempt(ctx context.Context, localDate string, status string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO download_schedule_config (id, last_missed_attempt_local_date, last_missed_attempt_status)
		VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			last_missed_attempt_local_date = excluded.last_missed_attempt_local_date,
			last_missed_attempt_status = excluded.last_missed_attempt_status
	`, localDate, status)
	if err != nil {
		return fmt.Errorf("record missed startup attempt: %w", err)
	}
	return nil
}

// derefInt64 safely dereferences an *int64 pointer, returning 0 when nil.
func derefInt64(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}
