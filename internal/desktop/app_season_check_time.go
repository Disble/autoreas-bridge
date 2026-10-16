package desktop

import (
	"context"
	"fmt"
	"sync"
	"time"

	"autoreas-bridge/internal/download"
)

// defaultSeasonCheckTimeHHMM is the shipped local time of the daily season
// availability check, used until the user picks another one.
const defaultSeasonCheckTimeHHMM = "21:00"

// allWeekdaysMask enables every weekday (bits 0..6 = Sunday..Saturday): a new
// episode 1 can come out on any day, so the season check never skips one.
const allWeekdaysMask byte = 0x7F

// seasonCheckTimeLayout is the strict 24-hour HH:MM shape the check time takes.
const seasonCheckTimeLayout = "15:04"

// isValidSeasonCheckTime reports whether value is exactly a zero-padded 24-hour
// HH:MM. time.Parse alone accepts "9:00", so the value must also round-trip.
func isValidSeasonCheckTime(value string) bool {
	parsed, err := time.Parse(seasonCheckTimeLayout, value)
	return err == nil && parsed.Format(seasonCheckTimeLayout) == value
}

// seasonCheckTime returns the effective daily check time: the stored one when it
// is a valid HH:MM, otherwise the shipped default. A missing store, a failed
// read and a malformed value all degrade to the default so the check keeps
// running every day instead of stopping on a settings problem. A panicking
// boundary is recovered too, as storedAPIAddr does: this runs on the scheduler
// goroutine, where an unrecovered panic would take the whole app down.
func (a *App) seasonCheckTime(ctx context.Context) (hhmm string) {
	if a.settingsStore == nil {
		return defaultSeasonCheckTimeHHMM
	}
	defer func() {
		if recover() != nil {
			hhmm = defaultSeasonCheckTimeHHMM
		}
	}()
	stored, err := a.settingsStore.SeasonCheckTime(ctx)
	if err != nil || !isValidSeasonCheckTime(stored) {
		return defaultSeasonCheckTimeHHMM
	}
	return stored
}

// GetSeasonCheckTime returns the local HH:MM at which the daily season
// availability check runs.
func (a *App) GetSeasonCheckTime() string {
	return a.seasonCheckTime(a.seasonCtx())
}

// SetSeasonCheckTime persists a new local HH:MM for the daily season
// availability check and wakes the season scheduler so the next run is
// re-armed at the new time without a restart. Returns "ok" or an error message.
func (a *App) SetSeasonCheckTime(hhmm string) string {
	if a.settingsStore == nil {
		return "settings store unavailable"
	}
	if !isValidSeasonCheckTime(hhmm) {
		return fmt.Sprintf("invalid time %q: use HH:MM (00:00-23:59)", hhmm)
	}
	if err := a.settingsStore.SetSeasonCheckTime(a.seasonCtx(), hhmm); err != nil {
		return err.Error()
	}
	if a.seasonScheduler != nil {
		a.seasonScheduler.NotifyConfigChanged()
	}
	return "ok"
}

// seasonScheduleStore is the schedule.ConfigStore of the daily availability
// job (SDD-43): always enabled, every day, at the user's check time, read on
// every scheduler pass. Run bookkeeping is kept in memory; the season job
// persists only its time.
type seasonScheduleStore struct {
	checkTime  func(ctx context.Context) string
	mu         sync.Mutex
	lastAtMs   int64
	lastStatus string
	nextAtMs   int64
}

// GetScheduleConfig returns the fixed daily config at the current check time.
func (s *seasonScheduleStore) GetScheduleConfig(ctx context.Context) (download.ScheduleConfig, error) {
	dailyTime := s.checkTime(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	return download.ScheduleConfig{
		Mode:            "daily",
		DailyTimeHHMM:   dailyTime,
		Enabled:         true,
		EnabledWeekdays: allWeekdaysMask,
		LastRunAtMs:     s.lastAtMs,
		LastRunStatus:   s.lastStatus,
		NextRunAtMs:     s.nextAtMs,
	}, nil
}

// MarkScheduleRun records the last run in memory.
func (s *seasonScheduleStore) MarkScheduleRun(_ context.Context, lastAtMs int64, status string, nextAtMs int64) error {
	s.mu.Lock()
	s.lastAtMs, s.lastStatus, s.nextAtMs = lastAtMs, status, nextAtMs
	s.mu.Unlock()
	return nil
}

// ApplyScheduleSettlement accepts every settlement; the season job keeps none.
func (s *seasonScheduleStore) ApplyScheduleSettlement(_ context.Context, _ download.ScheduleSettlementRequest) (download.ScheduleSettlementResult, error) {
	return download.ScheduleSettlementResult{Outcome: download.ScheduleSettlementApplied}, nil
}

// RecordMissedStartupAttempt is a no-op; the season job has no missed-run notice.
func (s *seasonScheduleStore) RecordMissedStartupAttempt(_ context.Context, _, _ string) error {
	return nil
}
