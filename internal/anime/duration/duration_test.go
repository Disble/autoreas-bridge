package duration

// TestClassify pins the fixed duration rule from the episode-duration design
// (docs/episode-duration-notice.md section 5): under 20 minutes is Short,
// 20 to 30 minutes inclusive is Normal, over 30 minutes is Long, and any
// runtime that cannot be read or is not positive is Unavailable.

import (
	"testing"
	"time"
)

func TestClassify(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		runtime  time.Duration
		expected Kind
	}{
		{name: "short just under 20 minutes", runtime: 19*time.Minute + 59*time.Second, expected: KindShort},
		{name: "normal at exactly 20 minutes", runtime: 20 * time.Minute, expected: KindNormal},
		{name: "normal just under 30 minutes", runtime: 29*time.Minute + 59*time.Second, expected: KindNormal},
		{name: "normal at exactly 30 minutes", runtime: 30 * time.Minute, expected: KindNormal},
		{name: "long just over 30 minutes", runtime: 30*time.Minute + time.Second, expected: KindLong},
		{name: "long finale runtime", runtime: 41 * time.Minute, expected: KindLong},
		{name: "long premiere runtime", runtime: 90 * time.Minute, expected: KindLong},
		{name: "unavailable zero runtime", runtime: 0, expected: KindUnavailable},
		{name: "unavailable negative runtime", runtime: -time.Minute, expected: KindUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := Classify(tc.runtime); got != tc.expected {
				t.Fatalf("Classify(%v) = %v, want %v", tc.runtime, got, tc.expected)
			}
		})
	}
}

// TestClassifyUnavailableNeverGuesses pins the fail-closed contract: a runtime
// that cannot be read (the zero value) must yield Unavailable, never a guess.
func TestClassifyUnavailableNeverGuesses(t *testing.T) {
	t.Parallel()

	var unread time.Duration

	if got := Classify(unread); got != KindUnavailable {
		t.Fatalf("Classify(unread runtime) = %v, want %v", got, KindUnavailable)
	}
}

// TestKindString keeps the enumeration printable for diagnostics.
func TestKindString(t *testing.T) {
	t.Parallel()

	cases := []struct {
		kind     Kind
		expected string
	}{
		{kind: KindShort, expected: "Short"},
		{kind: KindNormal, expected: "Normal"},
		{kind: KindLong, expected: "Long"},
		{kind: KindUnavailable, expected: "Unavailable"},
	}

	for _, tc := range cases {
		t.Run(tc.expected, func(t *testing.T) {
			t.Parallel()

			if got := tc.kind.String(); got != tc.expected {
				t.Fatalf("Kind(%d).String() = %q, want %q", int(tc.kind), got, tc.expected)
			}
		})
	}
}
