package schedule

import (
	"fmt"
	"time"

	"autoreas-bridge/internal/download"
)

// StartupMissedSelectedDayInput is the pure evaluator input for the startup-only missed notice.
type StartupMissedSelectedDayInput struct {
	Now              time.Time
	ProcessStartedAt time.Time
	Config           download.ScheduleConfig
}

// StartupMissedSelectedDayNotice is the read-model overlay surfaced to the app/frontend.
type StartupMissedSelectedDayNotice struct {
	LocalDate     string
	DueAtMs       int64
	AttemptStatus string
}

// EvaluateStartupMissedSelectedDay returns one missed-selected-day notice when startup crossed
// today's selected due boundary after the app was closed and the current local date remains unresolved.
func EvaluateStartupMissedSelectedDay(input StartupMissedSelectedDayInput) *StartupMissedSelectedDayNotice {
	if !input.Config.Enabled || input.Config.DailyTimeHHMM == "" || input.ProcessStartedAt.IsZero() || input.Now.IsZero() {
		return nil
	}

	localNow := input.Now.In(input.Now.Location())
	if !isSelectedWeekday(localNow, input.Config.EnabledWeekdays) {
		return nil
	}

	dueAt, err := currentLocalDueBoundary(localNow, input.Config.DailyTimeHHMM)
	if err != nil || !localNow.After(dueAt) || !input.ProcessStartedAt.In(localNow.Location()).After(dueAt) {
		return nil
	}

	localDate := localDateISO(localNow)
	if isResolvedLocalDate(input.Config, localDate, dueAt, localNow.Location()) {
		return nil
	}

	notice := &StartupMissedSelectedDayNotice{
		LocalDate: localDate,
		DueAtMs:   dueAt.UnixMilli(),
	}
	if input.Config.LastMissedAttemptDate == localDate {
		notice.AttemptStatus = input.Config.LastMissedAttemptStatus
	}
	return notice
}

// currentLocalDueBoundary constructs the local-time boundary for the given HH:MM time
// string applied to today's calendar date.
func currentLocalDueBoundary(now time.Time, hhmm string) (time.Time, error) {
	hour, minute, err := parseHHMM(hhmm)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location()), nil
}

// isSelectedWeekday returns true when the bitmask has the bit for the given time's weekday set.
func isSelectedWeekday(now time.Time, mask byte) bool {
	return mask&(1<<uint(now.Weekday())) != 0
}

// localDateISO returns the ISO-8601 calendar date (YYYY-MM-DD) for the given time
// interpreted in its own timezone.
func localDateISO(value time.Time) string {
	local := value.In(value.Location())
	return fmt.Sprintf("%04d-%02d-%02d", local.Year(), local.Month(), local.Day())
}

// isResolvedLocalDate returns true when the schedule config's settlement ledger or
// last-run success facts cover the given local date.
func isResolvedLocalDate(cfg download.ScheduleConfig, localDate string, dueAt time.Time, loc *time.Location) bool {
	if cfg.LastSettledLocalDate >= localDate {
		return true
	}
	if cfg.LastRunStatus != download.RunStatusOK || cfg.LastRunAtMs == 0 {
		return false
	}
	lastRun := time.UnixMilli(cfg.LastRunAtMs).In(loc)
	return localDateISO(lastRun) == localDate && !lastRun.Before(dueAt)
}
