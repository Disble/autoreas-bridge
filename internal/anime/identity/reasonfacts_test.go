package identity

import (
	"strings"
	"testing"
)

// TestReasonFacts pins WHICH FACT the abstention reason states, never how it is
// worded. A surviving mutant can swap "the target is already watched" for "the
// target has no accepted file", or blame fractional progress on a context the
// caller never marked as set. Those substitutions are decision-neutral but
// they tell the user something false, so the fact they name is behaviour and is
// asserted here; the sentence itself stays unpinned.
func TestReasonFacts(t *testing.T) {
	t.Parallel()

	const watchedFact = "already watched"

	rows := []struct {
		name         string
		entries      []Entry
		ctx          Context
		wantWatched  bool // reason must, or must not, name the already-watched fact
		wantFraction bool // reason must, or must not, name fractional progress
	}{
		{
			// R1: the accepted target is missing, not watched. Saying "already
			// watched" here is false.
			name:    "missing target is not reported as watched",
			entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx:     Context{ProgressSet: true, Progress: 1, ExpectedNextSet: true, ExpectedNext: 2},
		},
		{
			// R3: the requested ordinal is an accepted, watched file, so the
			// watched fact is the true explanation.
			name:        "watched target is reported as watched",
			entries:     []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx:         Context{ProgressSet: true, Progress: 1, ExpectedNextSet: true, ExpectedNext: 1},
			wantWatched: true,
		},
		{
			// R4: an unset progress token must not become the reason for a
			// fractional-progress abstention.
			name:    "unset progress is not blamed on a fraction",
			entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx:     Context{Progress: 0.5},
		},
		{
			// A genuinely fractional reading is the one case that may say so.
			name:         "fractional progress is named",
			entries:      []Entry{mk("Show - 13.mp4", "1", "2")},
			ctx:          Context{ProgressSet: true, Progress: 12.5},
			wantFraction: true,
		},
	}

	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := New().Identify(Request{Entries: tc.entries, Context: tc.ctx})
			if got.Next != nil {
				t.Fatalf("next = %+v, want an abstention", got.Next)
			}
			assertReasonShape(t, got.Reason)
			if strings.Contains(got.Reason, watchedFact) != tc.wantWatched {
				t.Errorf("reason %q names the watched fact = %v, want %v",
					got.Reason, strings.Contains(got.Reason, watchedFact), tc.wantWatched)
			}
			if strings.Contains(got.Reason, "fractional") != tc.wantFraction {
				t.Errorf("reason %q names fractional progress = %v, want %v",
					got.Reason, strings.Contains(got.Reason, "fractional"), tc.wantFraction)
			}
		})
	}
}
