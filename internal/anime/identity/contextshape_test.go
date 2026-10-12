package identity

import (
	"math"
	"slices"
	"testing"
)

// kindsOf extracts the sorted kind/detail pairs of a diagnostic set, so the
// table asserts typed kinds and never sentences. Basename and episode are
// identification, not taxonomy, and stay out of the comparison.
func kindsOf(ds []Diagnostic) []string {
	var out []string
	for _, d := range ds {
		out = append(out, string(d.Kind)+"/"+d.Detail)
	}
	slices.Sort(out)
	if len(out) == 0 {
		out = nil
	}
	return out
}

// TestContextShapes pins the context and timestamp guards at the decision
// seam: the selection outcome plus the typed diagnostic kinds present. A
// string expected-next has no Go encoding, so math.NaN stands in for it:
// present, numeric, but never a usable integer, exactly how the corpus
// mapper records a string token.
// contextRow is one context/timestamp shape feeding the decision.
type contextRow struct {
	name      string
	entries   []Entry
	ctx       Context
	wantEp    int
	wantBase  string
	wantKinds []string
}

// assertContextRow checks one shape: selection or abstention plus the typed
// diagnostic kinds present.
func assertContextRow(t *testing.T, tc contextRow) {
	t.Helper()
	got := New().Identify(Request{Entries: tc.entries, Context: tc.ctx})
	if tc.wantBase == "" {
		if got.Next != nil {
			t.Fatalf("next = %+v, want abstention", got.Next)
		}
	} else if got.Next == nil || got.Next.Episode != tc.wantEp || got.Next.Basename != tc.wantBase {
		t.Fatalf("next = %+v, want episode=%d basename=%q", got.Next, tc.wantEp, tc.wantBase)
	}
	if kinds := kindsOf(got.Diagnostics); !slices.Equal(kinds, tc.wantKinds) {
		t.Errorf("diagnostic kinds = %v, want %v (full=%+v)", kinds, tc.wantKinds, got.Diagnostics)
	}
	assertReasonShape(t, got.Reason)
}

func TestContextShapes(t *testing.T) {
	t.Parallel()
	rows := []contextRow{
		{name: "integer progress derives next", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show - 03.mp4", "5", "6")},
			ctx: Context{ProgressSet: true, Progress: 2}, wantEp: 3, wantBase: "Show - 03.mp4"},
		{name: "fractional progress abstains", entries: []Entry{mk("Show - 13.mp4", "1", "2"), mk("Show - 14.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12.5}, wantKinds: []string{"unusable-context/progress"}},
		{name: "negative progress abstains", entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: -1}, wantKinds: []string{"unusable-context/progress"}},
		{name: "zero expected-next is disclosed", entries: []Entry{mk("Show - 13.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 0},
			wantEp: 13, wantBase: "Show - 13.mp4", wantKinds: []string{"unusable-context/expected-next"}},
		{name: "fractional expected-next is disclosed", entries: []Entry{mk("Show - 13.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 12.5},
			wantEp: 13, wantBase: "Show - 13.mp4", wantKinds: []string{"unusable-context/expected-next"}},
		{name: "string expected-next is disclosed", entries: []Entry{mk("Show - 13.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: math.NaN()},
			wantEp: 13, wantBase: "Show - 13.mp4", wantKinds: []string{"unusable-context/expected-next"}},
		{name: "missing creation abstains", entries: []Entry{mk("a-cut.mp4", "", "2"), mk("b-cut.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}},
		{name: "missing modification abstains", entries: []Entry{mk("a-cut.mp4", "1", ""), mk("b-cut.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}},
		{name: "tied births abstain", entries: []Entry{mk("a-cut.mp4", "1", "2"), mk("b-cut.mp4", "1", "3")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}},
		{name: "reverse birth order selects earliest", entries: []Entry{mk("a-cut.mp4", "3", "4"), mk("b-cut.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantEp: 13, wantBase: "b-cut.mp4"},
		{name: "beyond int64 stays exact", entries: []Entry{
			mk("a-cut.mp4", "170141183460469231731687303715884105730", "170141183460469231731687303715884105731"),
			mk("b-cut.mp4", "170141183460469231731687303715884105728", "170141183460469231731687303715884105729")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantEp: 13, wantBase: "b-cut.mp4"},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertContextRow(t, tc)
		})
	}
}
