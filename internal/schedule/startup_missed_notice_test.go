package schedule

import (
	"testing"
	"time"

	"autoreas-bridge/internal/download"
)

func TestEvaluateStartupMissedSelectedDayShowsNoticeAfterDueForUnresolvedSelectedDate(t *testing.T) {
	loc := time.UTC
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              time.Date(2026, 7, 26, 21, 30, 0, 0, loc),
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, loc),
		Config: download.ScheduleConfig{
			Enabled:         true,
			DailyTimeHHMM:   "21:00",
			EnabledWeekdays: 1 << time.Sunday,
		},
	})

	if notice == nil {
		t.Fatal("expected a startup missed-selected-day notice")
	}
	if notice.LocalDate != "2026-07-26" {
		t.Fatalf("notice local date = %q, want 2026-07-26", notice.LocalDate)
	}
}

func TestEvaluateStartupMissedSelectedDaySuppressesExactBoundaryStartup(t *testing.T) {
	loc := time.UTC
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              time.Date(2026, 7, 26, 21, 0, 0, 0, loc),
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 0, 0, 0, loc),
		Config:           download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: 1 << time.Sunday},
	})

	if notice != nil {
		t.Fatalf("expected no notice at the exact due boundary, got %#v", notice)
	}
}

func TestEvaluateStartupMissedSelectedDaySuppressesProcessThatWasAlreadyAliveAtBoundary(t *testing.T) {
	loc := time.UTC
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              time.Date(2026, 7, 26, 21, 30, 0, 0, loc),
		ProcessStartedAt: time.Date(2026, 7, 26, 20, 45, 0, 0, loc),
		Config:           download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: 1 << time.Sunday},
	})

	if notice != nil {
		t.Fatalf("expected no notice when the process was already alive at the boundary, got %#v", notice)
	}
}

func TestEvaluateStartupMissedSelectedDayUsesLocalDateInsteadOfUTCDate(t *testing.T) {
	loc := mustLoadLocation(t, "America/New_York")
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              time.Date(2026, 7, 26, 0, 30, 0, 0, time.UTC).In(loc),
		ProcessStartedAt: time.Date(2026, 7, 26, 0, 15, 0, 0, time.UTC).In(loc),
		Config:           download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "20:00", EnabledWeekdays: 1 << time.Saturday},
	})

	if notice == nil {
		t.Fatal("expected a local-date notice around UTC midnight")
	}
	if notice.LocalDate != "2026-07-25" {
		t.Fatalf("notice local date = %q, want 2026-07-25", notice.LocalDate)
	}
}

func TestEvaluateStartupMissedSelectedDaySuppressesUnselectedDatesAndLaterSettlements(t *testing.T) {
	loc := time.UTC
	tests := []struct {
		name   string
		config download.ScheduleConfig
	}{
		{
			name:   "unselected weekday",
			config: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: "21:00", EnabledWeekdays: 1 << time.Monday},
		},
		{
			name: "later settlement already exists",
			config: download.ScheduleConfig{
				Enabled:              true,
				DailyTimeHHMM:        "21:00",
				EnabledWeekdays:      1 << time.Sunday,
				LastSettledLocalDate: "2026-07-27",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
				Now:              time.Date(2026, 7, 26, 21, 30, 0, 0, loc),
				ProcessStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, loc),
				Config:           tt.config,
			})
			if notice != nil {
				t.Fatalf("expected no notice, got %#v", notice)
			}
		})
	}
}

func TestEvaluateStartupMissedSelectedDayTreatsCurrentSuccessfulRunFactsAsResolvedDuringUpgrade(t *testing.T) {
	loc := time.UTC
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              time.Date(2026, 7, 26, 22, 0, 0, 0, loc),
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 30, 0, 0, loc),
		Config: download.ScheduleConfig{
			Enabled:              true,
			DailyTimeHHMM:        "21:00",
			EnabledWeekdays:      1 << time.Sunday,
			LastRunAtMs:          time.Date(2026, 7, 26, 21, 10, 0, 0, loc).UnixMilli(),
			LastRunStatus:        download.RunStatusOK,
			LastSettledLocalDate: "",
		},
	})

	if notice != nil {
		t.Fatalf("expected upgrade-safe run facts to suppress a false notice, got %#v", notice)
	}
}

func TestEvaluateStartupMissedSelectedDaySurfacesLatestUnresolvedAttemptTruth(t *testing.T) {
	loc := time.UTC
	notice := EvaluateStartupMissedSelectedDay(StartupMissedSelectedDayInput{
		Now:              time.Date(2026, 7, 26, 22, 0, 0, 0, loc),
		ProcessStartedAt: time.Date(2026, 7, 26, 21, 30, 0, 0, loc),
		Config: download.ScheduleConfig{
			Enabled:                 true,
			DailyTimeHHMM:           "21:00",
			EnabledWeekdays:         1 << time.Sunday,
			LastMissedAttemptDate:   "2026-07-26",
			LastMissedAttemptStatus: download.RunStatusPartial,
		},
	})

	if notice == nil {
		t.Fatal("expected unresolved notice to remain visible after a failed run-now attempt")
	}
	if notice.AttemptStatus != download.RunStatusPartial {
		t.Fatalf("notice attempt status = %q, want %q", notice.AttemptStatus, download.RunStatusPartial)
	}
}

// mustLoadLocation is a test helper that fatally fails the test when the time.Location
// name cannot be loaded.
func mustLoadLocation(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Skipf("tzdata unavailable in this environment: %v", err)
	}
	return loc
}
