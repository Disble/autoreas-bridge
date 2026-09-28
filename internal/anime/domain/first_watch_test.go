package domain

import (
	"testing"
	"time"
)

// TestIsFirstWatchTransition pins the single progress change that derives a
// first-watch instant: a still-undated anime crossing from unwatched (<= 0)
// to watched (> 0). Everything else must stay undated or keep its date.
func TestIsFirstWatchTransition(t *testing.T) {
	t.Parallel()

	stamped := time.UnixMilli(1600000000000).UTC()
	tests := []struct {
		name        string
		from        float64
		to          float64
		premieredAt *time.Time
		want        bool
	}{
		{name: "fractional progress above zero never stamps", from: 0.5, to: 1},
		{name: "zero to positive stamps", from: 0, to: 1, want: true},
		{name: "fractional first watch stamps", from: 0, to: 0.5, want: true},
		{name: "negative legacy progress to positive stamps", from: -1, to: 0.5, want: true},
		{name: "zero to zero is a no-op", from: 0, to: 0},
		{name: "zero to negative never stamps", from: 0, to: -1},
		{name: "positive to zero never stamps", from: 3, to: 0},
		{name: "positive to positive never stamps", from: 2, to: 3},
		{name: "legacy positive undated stays undated", from: 2.5, to: 3},
		{name: "already stamped keeps its date", from: 0, to: 1, premieredAt: &stamped},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := IsFirstWatchTransition(tc.from, tc.to, tc.premieredAt); got != tc.want {
				t.Fatalf("IsFirstWatchTransition(%v, %v, %v) = %v, want %v", tc.from, tc.to, tc.premieredAt, got, tc.want)
			}
		})
	}
}
