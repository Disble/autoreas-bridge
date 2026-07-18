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
		mode            string
		dailyTime       sql.NullString
		enabled         int
		lastRunAtMs     sql.NullInt64
		lastRunStatus   sql.NullString
		nextRunAtMs     sql.NullInt64
		enabledWeekdays sql.NullInt64
	)

	err := s.db.QueryRowContext(ctx, `
		SELECT mode, daily_time_hhmm, enabled, last_run_at_ms, last_run_status, next_run_at_ms, enabled_weekdays
		FROM download_schedule_config WHERE id = 1
	`).Scan(&mode, &dailyTime, &enabled, &lastRunAtMs, &lastRunStatus, &nextRunAtMs, &enabledWeekdays)
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
		Mode:            mode,
		DailyTimeHHMM:   dailyTime.String,
		Enabled:         enabled != 0,
		LastRunAtMs:     lastRunAtMs.Int64,
		LastRunStatus:   lastRunStatus.String,
		NextRunAtMs:     nextRunAtMs.Int64,
		EnabledWeekdays: weekdays,
	}, nil
}

// SetScheduleConfig upserts the scheduler configuration singleton.
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
		INSERT INTO download_schedule_config (id, mode, daily_time_hhmm, enabled, enabled_weekdays)
		VALUES (1, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			mode = excluded.mode,
			daily_time_hhmm = excluded.daily_time_hhmm,
			enabled = excluded.enabled,
			enabled_weekdays = excluded.enabled_weekdays
	`, mode, cfg.DailyTimeHHMM, enabled, cfg.EnabledWeekdays)
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
