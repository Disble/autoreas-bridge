package schedule

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type sleepResult int

const (
	sleepCancelled sleepResult = iota
	sleepElapsed
	sleepWoken
)

// sleepUntil waits (via the injected Clock/Timer seam) until `at`, returning whether the timer
// elapsed, the context was cancelled, or a config-change wakeup requested an immediate re-read.
// It NEVER calls time.Sleep directly -- this is the seam that makes the whole loop unit-testable
// with a fake clock (PR4a brief).
func (s *scheduler) sleepUntil(ctx context.Context, at time.Time) sleepResult {
	d := max(at.Sub(s.clock.Now()), 0)
	timer := s.clock.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return sleepCancelled
	case <-s.wake:
		return sleepWoken
	case <-timer.C():
		return sleepElapsed
	}
}

// maxWeekdayAdvancementIterations bounds the day-by-day search for an enabled weekday at 7.
const maxWeekdayAdvancementIterations = 7

// nextDailyBoundaryAfter computes the next enabled HH:MM boundary strictly after now.
func nextDailyBoundaryAfter(now time.Time, hhmm string, mask byte, loc *time.Location) (time.Time, error) {
	hour, minute, err := parseHHMM(hhmm)
	if err != nil {
		return time.Time{}, err
	}

	local := now.In(loc)
	candidate := time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, loc)
	if !candidate.After(local) {
		candidate = candidate.AddDate(0, 0, 1)
	}

	for range maxWeekdayAdvancementIterations {
		if mask&(1<<uint(candidate.Weekday())) != 0 {
			return candidate, nil
		}
		candidate = candidate.AddDate(0, 0, 1)
	}

	return time.Time{}, ErrNoEnabledWeekday
}

// parseHHMM parses a strict 24-hour HH:MM string.
func parseHHMM(hhmm string) (hour, minute int, err error) {
	parts := strings.Split(hhmm, ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("schedule: invalid daily_time_hhmm %q: want \"HH:MM\"", hhmm)
	}

	hour, err = strconv.Atoi(parts[0])
	if err != nil || hour < 0 || hour > 23 {
		return 0, 0, fmt.Errorf("schedule: invalid hour in daily_time_hhmm %q", hhmm)
	}

	minute, err = strconv.Atoi(parts[1])
	if err != nil || minute < 0 || minute > 59 {
		return 0, 0, fmt.Errorf("schedule: invalid minute in daily_time_hhmm %q", hhmm)
	}

	return hour, minute, nil
}
