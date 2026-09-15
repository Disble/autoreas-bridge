package cover

import (
	"net/http"
	"testing"
	"time"
)

func TestParseRetryAfterClampsOnlyEligibleOrigins(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name  string
		value string
		want  int
		ok    bool
	}{
		{name: "minimum accepted", value: "1", want: 1, ok: true},
		{name: "delta seconds", value: "15", want: 15, ok: true},
		{name: "http date", value: now.Add(9 * time.Second).Format(http.TimeFormat), want: 9, ok: true},
		{name: "minimum clamp", value: "0", want: 0, ok: false},
		{name: "maximum accepted", value: "3600", want: 3600, ok: true},
		{name: "just over maximum clamps", value: "3601", want: 3600, ok: true},
		{name: "maximum clamp", value: "7200", want: 3600, ok: true},
		{name: "malformed", value: "later", want: 0, ok: false},
		{name: "past date", value: now.Add(-time.Second).Format(http.TimeFormat), want: 0, ok: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseRetryAfter(tc.value, now)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("parseRetryAfter(%q) = %d, %v; want %d, %v", tc.value, got, ok, tc.want, tc.ok)
			}
		})
	}
}
