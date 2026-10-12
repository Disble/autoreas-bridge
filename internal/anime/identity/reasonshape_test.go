package identity

import (
	"strconv"
	"strings"
	"testing"
)

// TestReasonNames pins the IMPORTANT-tier contract for the handful of
// outcomes the interface shows: the reason is one non-empty sentence naming
// the expected episode. Full prose is never pinned, only the episode token.
func TestReasonNames(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name     string
		entries  []Entry
		ctx      Context
		wantEp   int
		wantBase string
	}{
		{name: "selected by clear number", entries: []Entry{mk("Show - 13.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantEp: 13, wantBase: "Show - 13.mp4"},
		{name: "selected by elimination", entries: []Entry{mk("Evening Becomes Night - 14.mp4", "1", "2"), mk("Evening Becomes Night finale.mp4", "", "")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantEp: 13, wantBase: "Evening Becomes Night finale.mp4"},
		{name: "selected by chronology", entries: []Entry{mk("north-cut.mp4", "1", "2"), mk("south-cut.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantEp: 13, wantBase: "north-cut.mp4"},
		{name: "abstained target already watched", entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 5, ExpectedNextSet: true, ExpectedNext: 1}, wantEp: 1},
		{name: "abstained no accepted file", entries: []Entry{mk("Show - 14.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantEp: 13},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := New().Identify(Request{Entries: tc.entries, Context: tc.ctx})
			if tc.wantBase == "" {
				if got.Next != nil {
					t.Fatalf("next = %+v, want abstention", got.Next)
				}
			} else if got.Next == nil || got.Next.Episode != tc.wantEp || got.Next.Basename != tc.wantBase {
				t.Fatalf("next = %+v, want episode=%d basename=%q", got.Next, tc.wantEp, tc.wantBase)
			}
			assertReasonShape(t, got.Reason)
			if token := "episode " + strconv.Itoa(tc.wantEp); !strings.Contains(got.Reason, token) {
				t.Errorf("reason %q does not name %q", got.Reason, token)
			}
		})
	}
}
