package cover

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	minRetryAfterSeconds = 1
	maxRetryAfterSeconds = 3600
)

// parseRetryAfter parses a positive delta-seconds value or future HTTP date and
// clamps a valid estimate to the endpoint's one-hour maximum.
func parseRetryAfter(value string, now time.Time) (int, bool) {
	value = strings.TrimSpace(value)
	if seconds, err := strconv.Atoi(value); err == nil {
		return clampRetryAfter(seconds)
	}
	date, err := http.ParseTime(value)
	if err != nil {
		return 0, false
	}
	return clampRetryAfter(int(date.Sub(now).Seconds()))
}

// clampRetryAfter rejects non-positive values and bounds valid estimates.
func clampRetryAfter(seconds int) (int, bool) {
	if seconds < minRetryAfterSeconds {
		return 0, false
	}
	if seconds > maxRetryAfterSeconds {
		return maxRetryAfterSeconds, true
	}
	return seconds, true
}
