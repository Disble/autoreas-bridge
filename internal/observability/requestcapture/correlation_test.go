package requestcapture

import (
	"context"
	"strings"
	"testing"
)

func TestAcceptClientRequestID(t *testing.T) {
	t.Parallel()

	cycle := "4f9c2a1e-0b7d-4c55-9a3e-2d1f8e6b7c90"
	cases := []struct {
		name, value, want string
	}{
		{"cycle and sequence", cycle + ":3", cycle + ":3"},
		{"longest cycle and sequence", strings.Repeat("a", 48) + ":123456789", strings.Repeat("a", 48) + ":123456789"},
		{"allowed punctuation", "a.b_c-d:0", "a.b_c-d:0"},
		{"absent", "", ""},
		{"no sequence", cycle, ""},
		{"empty sequence", cycle + ":", ""},
		{"empty cycle", ":3", ""},
		{"cycle too long", strings.Repeat("a", 49) + ":1", ""},
		{"sequence too long", "a:1234567890", ""},
		{"non-digit sequence", "a:3x", ""},
		{"space in cycle", "a b:1", ""},
		{"header injection", "a:1\r\nX-Evil: 1", ""},
		{"two separators", "a:1:2", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := AcceptClientRequestID(tc.value); got != tc.want {
				t.Fatalf("AcceptClientRequestID(%q) = %q, want %q", tc.value, got, tc.want)
			}
		})
	}
}

func TestRequestIDTravelsInTheContext(t *testing.T) {
	t.Parallel()

	ctx := WithRequestID(context.Background(), "req-1")
	if got := RequestIDFromContext(ctx); got != "req-1" {
		t.Fatalf("RequestIDFromContext = %q, want req-1", got)
	}
	if got := RequestIDFromContext(context.Background()); got != "" {
		t.Fatalf("RequestIDFromContext without an id = %q, want empty", got)
	}
}
