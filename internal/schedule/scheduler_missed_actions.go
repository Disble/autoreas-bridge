package schedule

import (
	"context"

	"autoreas-bridge/internal/download"
)

// ResolveMissedStartupDate revalidates and executes one missed-startup action for the exact local date.
//
//nolint:gocognit // action dispatch is inherently branchy; splitting would fragment a coherent claim-run-settle sequence
func (s *scheduler) ResolveMissedStartupDate(ctx context.Context, localDate string, action MissedStartupAction) MissedStartupActionResult {
	if !s.tryClaimMissedLocalDate(localDate) {
		return MissedStartupActionResult{Kind: MissedStartupActionRunInProgress, LocalDate: localDate, Message: ErrRunInProgress.Error()}
	}
	defer s.releaseMissedLocalDate(localDate)

	cfg, notice := s.revalidateMissedNotice(ctx, localDate)
	if notice == nil {
		if cfg.LastSettledLocalDate >= localDate {
			return MissedStartupActionResult{Kind: MissedStartupActionAlreadyResolved, LocalDate: localDate}
		}
		return MissedStartupActionResult{Kind: MissedStartupActionNotAvailable, LocalDate: localDate}
	}

	switch action {
	case MissedStartupActionIgnore:
		nextRunAtMs := s.computeStrictFutureNextRunAtMs(cfg)
		settlement, err := s.store.ApplyScheduleSettlement(ctx, download.ScheduleSettlementRequest{
			LocalDate:   localDate,
			Reason:      download.ScheduleSettlementIgnored,
			NextRunAtMs: nextRunAtMs,
		})
		if err != nil {
			return MissedStartupActionResult{Kind: MissedStartupActionError, LocalDate: localDate, Message: err.Error()}
		}
		return s.mapSettlementOutcome(localDate, settlement, download.ScheduleSettlementIgnored, download.RunStatusOK)
	case MissedStartupActionRunNow:
		runCtx, doneChan, ok := s.acquire(ctx)
		if !ok {
			return MissedStartupActionResult{Kind: MissedStartupActionRunInProgress, LocalDate: localDate, Message: ErrRunInProgress.Error()}
		}
		status, runErr := s.executeRun(runCtx, doneChan, "missed_startup")
		terminalStatus := normalizeTerminalStatus(status, runErr)
		if runErr == nil && status == download.RunStatusOK {
			runAtMs := s.clock.Now().UnixMilli()
			settlement, err := s.store.ApplyScheduleSettlement(ctx, download.ScheduleSettlementRequest{
				LocalDate:         localDate,
				Reason:            download.ScheduleSettlementRunNow,
				NextRunAtMs:       s.computeStrictFutureNextRunAtMs(cfg),
				SuccessfulRunAtMs: &runAtMs,
				SuccessfulStatus:  status,
			})
			if err != nil {
				return MissedStartupActionResult{Kind: MissedStartupActionError, LocalDate: localDate, TerminalStatus: terminalStatus, Message: err.Error()}
			}
			return s.mapSettlementOutcome(localDate, settlement, download.ScheduleSettlementRunNow, status)
		}
		if err := s.store.RecordMissedStartupAttempt(ctx, localDate, terminalStatus); err != nil {
			return MissedStartupActionResult{Kind: MissedStartupActionError, LocalDate: localDate, TerminalStatus: terminalStatus, Message: err.Error()}
		}
		return MissedStartupActionResult{Kind: MissedStartupActionUnresolvedTerminal, LocalDate: localDate, TerminalStatus: terminalStatus}
	default:
		return MissedStartupActionResult{Kind: MissedStartupActionError, LocalDate: localDate, Message: "unknown missed-startup action"}
	}
}

// computeStrictFutureNextRunAtMs returns the next strict-future selected weekday boundary
// as a Unix-millis timestamp, or 0 when the schedule is disabled or timing is unparseable.
func (s *scheduler) computeStrictFutureNextRunAtMs(cfg download.ScheduleConfig) int64 {
	if !cfg.Enabled {
		return 0
	}
	next, err := nextDailyBoundaryAfter(s.clock.Now(), cfg.DailyTimeHHMM, cfg.EnabledWeekdays, s.clock.Now().Location())
	if err != nil {
		return 0
	}
	return next.UnixMilli()
}

// normalizeTerminalStatus maps nil errors and empty status strings to well-known
// terminal download.RunStatus values so callers always receive a populated status.
func normalizeTerminalStatus(status string, runErr error) string {
	if status != "" {
		return status
	}
	if runErr != nil {
		return download.RunStatusError
	}
	return download.RunStatusOK
}

// revalidateMissedNotice refreshes the schedule config from the store and re-evaluates
// whether a missed notice for the given local date still exists. This guards against
// stale-client replay after a notice becomes dated.
func (s *scheduler) revalidateMissedNotice(ctx context.Context, localDate string) (download.ScheduleConfig, *StartupMissedSelectedDayNotice) {
	cfg, err := s.store.GetScheduleConfig(ctx)
	if err != nil {
		return download.ScheduleConfig{}, nil
	}
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              s.clock.Now(),
		ProcessStartedAt: s.processStartedAt,
		Config:           cfg,
	})
	if notice == nil || notice.LocalDate != localDate {
		return cfg, nil
	}
	return cfg, notice
}

// mapSettlementOutcome converts the store-level settlement result to the
// scheduler-level authority action result.
func (s *scheduler) mapSettlementOutcome(localDate string, settlement download.ScheduleSettlementResult, reason download.ScheduleSettlementReason, status string) MissedStartupActionResult {
	switch settlement.Outcome {
	case download.ScheduleSettlementApplied:
		return MissedStartupActionResult{Kind: MissedStartupActionSettled, LocalDate: localDate, TerminalStatus: status, SettlementReason: reason}
	case download.ScheduleSettlementIdempotent, download.ScheduleSettlementObsolete:
		return MissedStartupActionResult{Kind: MissedStartupActionAlreadyResolved, LocalDate: localDate, TerminalStatus: status, SettlementReason: reason}
	default:
		return MissedStartupActionResult{Kind: MissedStartupActionError, LocalDate: localDate, TerminalStatus: status, Message: "unknown schedule settlement outcome"}
	}
}

// tryClaimMissedLocalDate attempts to acquire the process-local missed-date claim under
// the scheduler mutex. Returns false when another claim is already active.
func (s *scheduler) tryClaimMissedLocalDate(localDate string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.claimedMissedLocalDate != "" {
		return false
	}
	s.claimedMissedLocalDate = localDate
	return true
}

// releaseMissedLocalDate clears the process-local missed-date claim when it matches the
// given local date.
func (s *scheduler) releaseMissedLocalDate(localDate string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.claimedMissedLocalDate == localDate {
		s.claimedMissedLocalDate = ""
	}
}
