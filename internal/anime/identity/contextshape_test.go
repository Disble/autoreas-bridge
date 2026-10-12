package identity

import (
	"math"
	"math/big"
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

// TestUsableProgressBoundaries pins the progress token edges: zero and one
// are exact usable integers, the bound itself stays usable, and anything
// fractional, negative, out of range, or unset never truncates into one.
func TestUsableProgressBoundaries(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		ctx  Context
		want int
		ok   bool
	}{
		{name: "zero is usable", ctx: Context{ProgressSet: true, Progress: 0}, want: 0, ok: true},
		{name: "one is usable", ctx: Context{ProgressSet: true, Progress: 1}, want: 1, ok: true},
		{name: "large exact integer is usable", ctx: Context{ProgressSet: true, Progress: 1 << 30}, want: 1 << 30, ok: true},
		{name: "exact-integer ceiling is usable", ctx: Context{ProgressSet: true, Progress: 1 << 53}, want: 1 << 53, ok: true},
		{name: "past exact-integer range is unusable", ctx: Context{ProgressSet: true, Progress: 1<<53 + 2}, ok: false},
		{name: "fractional is unusable", ctx: Context{ProgressSet: true, Progress: 12.5}, ok: false},
		{name: "negative is unusable", ctx: Context{ProgressSet: true, Progress: -1}, ok: false},
		{name: "unset is unusable", ctx: Context{}, ok: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got, ok := usableProgress(tc.ctx); got != tc.want || ok != tc.ok {
				t.Errorf("usableProgress(%+v) = %v/%v, want %v/%v", tc.ctx, got, ok, tc.want, tc.ok)
			}
		})
	}
}

// TestUsableExpectedBoundaries pins the expected-next token edges: one is
// the smallest usable value, zero never qualifies, and fractional, NaN
// (the string-token encoding), or unset tokens stay disclosed but unusable.
func TestUsableExpectedBoundaries(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		ctx  Context
		want int
		ok   bool
	}{
		{name: "one is usable", ctx: Context{ExpectedNextSet: true, ExpectedNext: 1}, want: 1, ok: true},
		{name: "zero is unusable", ctx: Context{ExpectedNextSet: true, ExpectedNext: 0}, ok: false},
		{name: "negative is unusable", ctx: Context{ExpectedNextSet: true, ExpectedNext: -3}, ok: false},
		{name: "fractional is unusable", ctx: Context{ExpectedNextSet: true, ExpectedNext: 12.5}, ok: false},
		{name: "string token is unusable", ctx: Context{ExpectedNextSet: true, ExpectedNext: math.NaN()}, ok: false},
		{name: "unset is unusable", ctx: Context{}, ok: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got, ok := usableExpected(tc.ctx); got != tc.want || ok != tc.ok {
				t.Errorf("usableExpected(%+v) = %v/%v, want %v/%v", tc.ctx, got, ok, tc.want, tc.ok)
			}
		})
	}
}

// TestUsableNextShapes pins the aim: a usable expected-next wins,
// otherwise exact integer progress implies progress+1, and an unusable
// expected token falls back to progress instead of abstaining.
func TestUsableNextShapes(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		ctx  Context
		want int
		ok   bool
	}{
		{name: "expected wins", ctx: Context{ProgressSet: true, Progress: 5, ExpectedNextSet: true, ExpectedNext: 8}, want: 8, ok: true},
		{name: "progress implies next", ctx: Context{ProgressSet: true, Progress: 2}, want: 3, ok: true},
		{name: "zero progress implies one", ctx: Context{ProgressSet: true, Progress: 0}, want: 1, ok: true},
		{name: "unusable expected falls back to progress", ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: math.NaN()}, want: 13, ok: true},
		{name: "nothing usable abstains", ctx: Context{}, ok: false},
		{name: "fractional progress abstains", ctx: Context{ProgressSet: true, Progress: 12.5}, ok: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got, ok := usableNext(tc.ctx); got != tc.want || ok != tc.ok {
				t.Errorf("usableNext(%+v) = %v/%v, want %v/%v", tc.ctx, got, ok, tc.want, tc.ok)
			}
		})
	}
}

// TestUsableOrdinalBoundaries pins the shared validator: non-finite and
// fractional readings never convert, and the minimum and the bound are
// inclusive on both sides.
func TestUsableOrdinalBoundaries(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		f    float64
		min  int
		want int
		ok   bool
	}{
		{name: "minimum is usable", f: 1, min: 1, want: 1, ok: true},
		{name: "below minimum is unusable", f: 0, min: 1, ok: false},
		{name: "zero minimum admits zero", f: 0, min: 0, want: 0, ok: true},
		{name: "large exact integer is usable", f: 1 << 30, min: 0, want: 1 << 30, ok: true},
		{name: "exact-integer ceiling is usable", f: 1 << 53, min: 0, want: 1 << 53, ok: true},
		{name: "past exact-integer range is unusable", f: 1<<53 + 2, min: 0, ok: false},
		{name: "fractional is unusable", f: 1.5, min: 0, ok: false},
		{name: "NaN is unusable", f: math.NaN(), min: 0, ok: false},
		{name: "positive infinity is unusable", f: math.Inf(1), min: 0, ok: false},
		{name: "negative infinity is unusable", f: math.Inf(-1), min: 0, ok: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got, ok := usableOrdinal(tc.f, tc.min); got != tc.want || ok != tc.ok {
				t.Errorf("usableOrdinal(%v, %d) = %v/%v, want %v/%v", tc.f, tc.min, got, ok, tc.want, tc.ok)
			}
		})
	}
}

// TestFractionalProgressShapes pins the fractional abstention sentence
// guard: only a set, finite, non-integer reading earns it.
func TestFractionalProgressShapes(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		ctx  Context
		want bool
	}{
		{name: "fractional earns it", ctx: Context{ProgressSet: true, Progress: 12.5}, want: true},
		{name: "integer does not", ctx: Context{ProgressSet: true, Progress: 12}, want: false},
		{name: "zero does not", ctx: Context{ProgressSet: true, Progress: 0}, want: false},
		{name: "NaN does not", ctx: Context{ProgressSet: true, Progress: math.NaN()}, want: false},
		{name: "infinity does not", ctx: Context{ProgressSet: true, Progress: math.Inf(1)}, want: false},
		{name: "unset does not", ctx: Context{}, want: false},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := fractionalProgress(tc.ctx); got != tc.want {
				t.Errorf("fractionalProgress(%+v) = %v, want %v", tc.ctx, got, tc.want)
			}
		})
	}
}

// TestParseNsShapes pins the timestamp reader: empty and malformed
// readings are unavailable (a Go-specific fail-closed guard with no
// prototype encoding), while zero, negative, and beyond-int64 readings
// stay exact signed big integers, never zero-filled and never a crash.
func TestParseNsShapes(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		{name: "empty is unavailable", in: "", ok: false},
		{name: "zero is available", in: "0", want: "0", ok: true},
		{name: "one is available", in: "1", want: "1", ok: true},
		{name: "negative stays signed", in: "-5", want: "-5", ok: true},
		{name: "negative zero stays signed", in: "-7", want: "-7", ok: true},
		{name: "malformed is unavailable", in: "abc", ok: false},
		{name: "beyond int64 stays exact", in: "170141183460469231731687303715884105730", want: "170141183460469231731687303715884105730", ok: true},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := parseNs(tc.in)
			if ok != tc.ok {
				t.Fatalf("parseNs(%q) ok = %v, want %v", tc.in, ok, tc.ok)
			}
			if ok && got.String() != tc.want {
				t.Errorf("parseNs(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// mustNs parses a decimal reading for chronology fixtures; the inputs are
// literals the table owns, so a failure is a table bug, not a decision.
func mustNs(s string) *big.Int {
	v, ok := new(big.Int).SetString(s, 10)
	if !ok {
		panic("bad timestamp literal " + s)
	}
	return v
}

// TestChronologyOrderShapes pins exact big-integer chronology: a lone file
// never orders, equal births or equal mtimes abstain, and a single
// nanosecond — even beyond int64 — decides earliest-first.
func TestChronologyOrderShapes(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name   string
		stamps []stamp
		want   []int
		ok     bool
	}{
		{name: "empty abstains", stamps: nil, ok: false},
		{name: "single abstains", stamps: []stamp{{birth: mustNs("1"), mtime: mustNs("2")}}, ok: false},
		{name: "equal births abstain", stamps: []stamp{{birth: mustNs("1"), mtime: mustNs("2")}, {birth: mustNs("1"), mtime: mustNs("3")}}, ok: false},
		{name: "equal mtimes abstain", stamps: []stamp{{birth: mustNs("1"), mtime: mustNs("5")}, {birth: mustNs("3"), mtime: mustNs("5")}}, ok: false},
		{name: "one nanosecond decides", stamps: []stamp{{birth: mustNs("101"), mtime: mustNs("201")}, {birth: mustNs("100"), mtime: mustNs("200")}}, want: []int{1, 0}, ok: true},
		{name: "beyond int64 stays exact", stamps: []stamp{{birth: mustNs("340282366920938463463374607431768211457"), mtime: mustNs("340282366920938463463374607431768211460")}, {birth: mustNs("340282366920938463463374607431768211456"), mtime: mustNs("340282366920938463463374607431768211458")}}, want: []int{1, 0}, ok: true},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := chronologyOrder(tc.stamps)
			if ok != tc.ok {
				t.Fatalf("chronologyOrder ok = %v, want %v", ok, tc.ok)
			}
			if ok && !slices.Equal(got, tc.want) {
				t.Errorf("chronologyOrder = %v, want %v", got, tc.want)
			}
		})
	}
}
