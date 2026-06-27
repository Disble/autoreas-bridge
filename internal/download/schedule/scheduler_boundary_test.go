package schedule

import (
	"errors"
	"testing"
	"time"
)

func TestNextDailyBoundaryAfterReturnsTodayWhenTimeNotYetPassed(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", allWeekdaysMask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := time.Date(2026, 6, 22, 14, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Fatalf("next boundary = %v, want %v", next, want)
	}
}

func TestNextDailyBoundaryAfterRollsToTomorrowWhenTimeAlreadyPassedToday(t *testing.T) {
	now := time.Date(2026, 6, 22, 15, 0, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", allWeekdaysMask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := time.Date(2026, 6, 23, 14, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Fatalf("next boundary = %v, want %v", next, want)
	}
}

func TestNextDailyBoundaryAfterIsExactlyNowRollsToTomorrow(t *testing.T) {
	now := time.Date(2026, 6, 22, 14, 30, 0, 0, time.UTC)

	next, err := nextDailyBoundaryAfter(now, "14:30", allWeekdaysMask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := time.Date(2026, 6, 23, 14, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Fatalf("a boundary exactly equal to now must roll to tomorrow (next due tick), got %v want %v", next, want)
	}
}

func TestNextDailyBoundaryAfterRejectsMalformedHHMM(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	if _, err := nextDailyBoundaryAfter(now, "not-a-time", allWeekdaysMask, now.Location()); err == nil {
		t.Fatal("expected an error for a malformed HH:MM string, got nil")
	}
}

func TestNextDailyBoundaryAfterIsTimezoneSaneAcrossLocations(t *testing.T) {
	utc := time.Date(2026, 6, 22, 0, 0, 0, 0, time.UTC)

	tzNY, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable in this environment: %v", err)
	}

	nextUTC, err := nextDailyBoundaryAfter(utc, "09:00", allWeekdaysMask, time.UTC)
	if err != nil {
		t.Fatalf("unexpected error (UTC): %v", err)
	}
	nextNY, err := nextDailyBoundaryAfter(utc.In(tzNY), "09:00", allWeekdaysMask, tzNY)
	if err != nil {
		t.Fatalf("unexpected error (NY): %v", err)
	}

	if nextUTC.Equal(nextNY) {
		t.Fatalf("09:00 in UTC and 09:00 in America/New_York must be different instants, got both = %v", nextUTC)
	}
	if nextNY.Location().String() != tzNY.String() {
		t.Fatalf("boundary location = %v, want %v", nextNY.Location(), tzNY)
	}
}

func TestNextDailyBoundaryAfterWeekdayMaskCases(t *testing.T) {
	loc := time.UTC

	tests := []struct {
		name string
		now  time.Time
		hhmm string
		mask byte
		want time.Time
	}{
		{
			name: "today enabled and before configured time -> same-day candidate, zero advancement",
			now:  time.Date(2026, 6, 24, 8, 0, 0, 0, loc),
			hhmm: "14:30",
			mask: 1 << time.Wednesday,
			want: time.Date(2026, 6, 24, 14, 30, 0, 0, loc),
		},
		{
			name: "today disabled, next enabled day later in week -> advances day-by-day",
			now:  time.Date(2026, 6, 25, 8, 0, 0, 0, loc),
			hhmm: "09:00",
			mask: 1 << time.Saturday,
			want: time.Date(2026, 6, 27, 9, 0, 0, 0, loc),
		},
		{
			name: "wrap across week boundary: only Wednesday enabled, today Thursday -> next Wednesday",
			now:  time.Date(2026, 6, 25, 8, 0, 0, 0, loc),
			hhmm: "09:00",
			mask: 1 << time.Wednesday,
			want: time.Date(2026, 7, 1, 9, 0, 0, 0, loc),
		},
		{
			name: "all-7-bits mask -> identical fire timing to legacy daily behavior (today, before time)",
			now:  time.Date(2026, 6, 22, 8, 0, 0, 0, loc),
			hhmm: "09:00",
			mask: allWeekdaysMask,
			want: time.Date(2026, 6, 22, 9, 0, 0, 0, loc),
		},
		{
			name: "all-7-bits mask -> identical fire timing to legacy daily behavior (time already passed, rolls to tomorrow)",
			now:  time.Date(2026, 6, 22, 10, 0, 0, 0, loc),
			hhmm: "09:00",
			mask: allWeekdaysMask,
			want: time.Date(2026, 6, 23, 9, 0, 0, 0, loc),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := nextDailyBoundaryAfter(tc.now, tc.hhmm, tc.mask, loc)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !got.Equal(tc.want) {
				t.Fatalf("next boundary = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestNextDailyBoundaryAfterReturnsErrNoEnabledWeekdayForEmptyMask(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)

	_, err := nextDailyBoundaryAfter(now, "09:00", 0, now.Location())
	if !errors.Is(err, ErrNoEnabledWeekday) {
		t.Fatalf("expected ErrNoEnabledWeekday for an empty mask, got %v", err)
	}
}

func TestNextDailyBoundaryAfterAdvancementIsCappedAtSevenIterations(t *testing.T) {
	now := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)
	mask := byte(1 << time.Monday)

	got, err := nextDailyBoundaryAfter(now, "09:00", mask, now.Location())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 6, 29, 9, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("next boundary = %v, want %v (advancement must be capped at 7 iterations)", got, want)
	}
}
