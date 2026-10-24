package requestcapture

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/observability/activityread"
)

// hourlyTotals answers get_hourly_totals for one of the calendar's local
// days, in the sidecar clock's location.
func (t tools) hourlyTotals(ctx context.Context, in HourlyTotalsInput) (HourlyTotalsResult, error) {
	now := t.now()
	start, err := requestedDay(in, now)
	if err != nil {
		return HourlyTotalsResult{}, err
	}
	totals, err := t.reader.activity.HourlyTotals(ctx, start)
	if err != nil {
		return HourlyTotalsResult{}, err
	}
	window := newTimeRange(start.UnixMilli(), start.AddDate(0, 0, 1).UnixMilli()-1)
	coverage, err := t.coverage(ctx, window, sourceRollup)
	return HourlyTotalsResult{DayStartMS: start.UnixMilli(), Totals: totals, Coverage: coverage}, err
}

// requestedDay returns local midnight of the day named by exactly one of
// day and day_ms. The day must be one of the calendar's
// activityread.CalendarDays local days ending today, the rollup's retention.
func requestedDay(in HourlyTotalsInput, now time.Time) (time.Time, error) {
	date := strings.TrimSpace(in.Day)
	switch {
	case date != "" && in.DayMS != nil:
		return time.Time{}, errors.New("give day or day_ms, not both")
	case in.DayMS != nil:
		return calendarDay(time.UnixMilli(*in.DayMS).In(now.Location()), now)
	case date != "":
		return calendarDate("day", date, now)
	}
	return time.Time{}, errors.New("day or day_ms is required")
}

// calendarDate parses field's local date and checks it is a calendar day.
func calendarDate(field, date string, now time.Time) (time.Time, error) {
	parsed, err := time.ParseInLocation(time.DateOnly, date, now.Location())
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be a date as YYYY-MM-DD: %q", field, date)
	}
	return calendarDay(parsed, now)
}

// calendarDay returns local midnight of the day holding at, which must be
// one of the activityread.CalendarDays local days ending today.
func calendarDay(at, now time.Time) (time.Time, error) {
	start := localMidnight(at, now.Location())
	today := localMidnight(now, now.Location())
	if start.After(today) || start.Before(today.AddDate(0, 0, 1-activityread.CalendarDays)) {
		return time.Time{}, fmt.Errorf("day %s is outside the last %d local days", start.Format(time.DateOnly), activityread.CalendarDays)
	}
	return start, nil
}

// localMidnight returns the start of the day holding at in loc.
func localMidnight(at time.Time, loc *time.Location) time.Time {
	year, month, day := at.In(loc).Date()
	return time.Date(year, month, day, 0, 0, 0, 0, loc)
}
