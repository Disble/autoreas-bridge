package identity

import (
	"math"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// mk builds an entry with explicit decimal timestamps; "" means unavailable.
func mk(name, birth, mtime string) Entry {
	return Entry{Basename: name, BirthNs: birth, MtimeNs: mtime}
}

// assertReasonShape asserts the IMPORTANT-tier contract: one short human
// sentence, never pinned prose.
func assertReasonShape(t *testing.T, reason string) {
	t.Helper()
	if reason == "" || strings.Contains(reason, "\n") || !strings.HasSuffix(reason, ".") {
		t.Errorf("reason is not one sentence: %q", reason)
	}
}

// TestSelect pins every path that names a next file: the decision, its
// basis, the partition counts, and the exact typed diagnostics.
func TestSelect(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name      string
		entries   []Entry
		ctx       Context
		wantEp    int
		wantBase  string
		wantBasis Basis
		wantW     int
		wantP     int
		wantDiags []Diagnostic
	}{
		{name: "clear pending number", entries: []Entry{mk("Mushoku Tensei III 13.mp4", "1", "2"), mk("Different Release Group Title - 14.mp4", "3", "4")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "Mushoku Tensei III 13.mp4", wantBasis: BasisDirectNumber, wantP: 2},
		{name: "inversion kept as fact", entries: []Entry{mk("Mushoku Tensei III 13.mp4", "1792010000000000000", "1792010000500000000"), mk("Different Release Group Title - 14.mp4", "1792000000000000000", "1792000000500000000"), mk("Show - 10+11.mp4", "1792020000000000000", "1792020000500000000")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "Mushoku Tensei III 13.mp4", wantBasis: BasisDirectNumber, wantP: 3,
			wantDiags: []Diagnostic{{Kind: DiagnosticInversion, Basename: "Mushoku Tensei III 13.mp4", Episode: 13, Detail: "Different Release Group Title - 14.mp4"}}},
		{name: "own retained-mtime inversion", entries: []Entry{mk("Show - 07.mp4", "9", "3")},
			ctx:    Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7},
			wantEp: 7, wantBase: "Show - 07.mp4", wantBasis: BasisDirectNumber, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticInversion, Basename: "Show - 07.mp4", Episode: 7, Detail: "Show - 07.mp4"}}},
		{name: "watched prefix partitions", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show - 03.mp4", "5", "6"), mk("Show - 04.mp4", "7", "8")},
			ctx:    Context{ProgressSet: true, Progress: 3, ExpectedNextSet: true, ExpectedNext: 4},
			wantEp: 4, wantBase: "Show - 04.mp4", wantBasis: BasisDirectNumber, wantW: 3, wantP: 1},
		{name: "rewatch from zero", entries: []Entry{mk("Harbor Lights Rewatch - 01.mp4", "1", "2"), mk("Harbor Lights Rewatch - 02.mp4", "3", "4")},
			ctx:    Context{ProgressSet: true, Progress: 0, ExpectedNextSet: true, ExpectedNext: 1},
			wantEp: 1, wantBase: "Harbor Lights Rewatch - 01.mp4", wantBasis: BasisDirectNumber, wantP: 2},
		{name: "agreeing tag", entries: []Entry{{Basename: "Show - 13.mp4", BirthNs: "1", MtimeNs: "2", Tags: []string{"EP13"}}},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "Show - 13.mp4", wantBasis: BasisDirectNumber, wantP: 1},
		{name: "unusable expected token disclosed", entries: []Entry{mk("Show - 13.mp4", "1", "2"), mk("Show - 14.mp4", "3", "4")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: math.NaN()},
			wantEp: 13, wantBase: "Show - 13.mp4", wantBasis: BasisDirectNumber, wantP: 2,
			wantDiags: []Diagnostic{{Kind: DiagnosticUnusableContext, Detail: "expected-next"}}},
		{name: "elimination beside numbered sibling", entries: []Entry{mk("Evening Becomes Night - 14.mp4", "1", "2"), mk("Evening Becomes Night finale.mp4", "", "")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "Evening Becomes Night finale.mp4", wantBasis: BasisElimination, wantP: 2},
		{name: "single pending under complete prefix", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show - 03.mp4", "5", "6"), mk("finale.mp4", "7", "8")},
			ctx:    Context{ProgressSet: true, Progress: 3},
			wantEp: 4, wantBase: "finale.mp4", wantBasis: BasisElimination, wantW: 3, wantP: 1},
		{name: "pending chronology", entries: []Entry{mk("north-cut.mp4", "1", "2"), mk("south-cut.mp4", "3", "4")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "north-cut.mp4", wantBasis: BasisChronology, wantP: 2},
		{name: "tied births select cleanly", entries: []Entry{mk("Show - 12.mp4", "5", "4"), mk("Show - 13.mp4", "5", "6"), mk("Show - 14.mp4", "5", "7")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "Show - 13.mp4", wantBasis: BasisDirectNumber, wantW: 1, wantP: 2},
		{name: "expected wins over progress", entries: []Entry{mk("Show - 08.mp4", "1", "2"), mk("Show - 09.mp4", "3", "4")},
			ctx:    Context{ProgressSet: true, Progress: 5, ExpectedNextSet: true, ExpectedNext: 8},
			wantEp: 8, wantBase: "Show - 08.mp4", wantBasis: BasisDirectNumber, wantP: 2},
		{name: "agreeing expectation enables prefix elimination", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show - 03.mp4", "5", "6"), mk("finale.mp4", "7", "8")},
			ctx:    Context{ProgressSet: true, Progress: 3, ExpectedNextSet: true, ExpectedNext: 4},
			wantEp: 4, wantBase: "finale.mp4", wantBasis: BasisElimination, wantW: 3, wantP: 1},
		{name: "same number twice is not a conflict", entries: []Entry{mk("Show S01E13 - 13.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
			wantEp: 13, wantBase: "Show S01E13 - 13.mp4", wantBasis: BasisDirectNumber, wantP: 1},
		{name: "version prefix is not fractional", entries: []Entry{mk("Show v1.2.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 1, ExpectedNextSet: true, ExpectedNext: 2},
			wantEp: 2, wantBase: "Show v1.2.mp4", wantBasis: BasisDirectNumber, wantP: 1},
		{name: "ver prefix version", entries: []Entry{mk("ver1.2.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 1, ExpectedNextSet: true, ExpectedNext: 2},
			wantEp: 2, wantBase: "ver1.2.mp4", wantBasis: BasisDirectNumber, wantP: 1},
		{name: "trailing version word", entries: []Entry{mk("dev 1.2.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 1, ExpectedNextSet: true, ExpectedNext: 2},
			wantEp: 2, wantBase: "dev 1.2.mp4", wantBasis: BasisDirectNumber, wantP: 1},
		{name: "invalid timestamps never crash", entries: []Entry{{Basename: "Show - 07.mp4", BirthNs: "abc", MtimeNs: "-5"}, mk("Show - 08.mp4", "9", "10")},
			ctx:    Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7},
			wantEp: 7, wantBase: "Show - 07.mp4", wantBasis: BasisDirectNumber, wantP: 2},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := New().Identify(Request{Entries: tc.entries, Context: tc.ctx})
			if got.Next == nil || got.Next.Episode != tc.wantEp || got.Next.Basename != tc.wantBase {
				t.Fatalf("next = %+v, want episode=%d basename=%q", got.Next, tc.wantEp, tc.wantBase)
			}
			if got.Basis != tc.wantBasis {
				t.Errorf("basis = %q, want %q", got.Basis, tc.wantBasis)
			}
			if got.Watched != tc.wantW || got.Pending != tc.wantP {
				t.Errorf("watched/pending = %d/%d, want %d/%d", got.Watched, got.Pending, tc.wantW, tc.wantP)
			}
			if !slices.Equal(got.Diagnostics, tc.wantDiags) {
				t.Errorf("diagnostics = %+v, want %+v", got.Diagnostics, tc.wantDiags)
			}
			assertReasonShape(t, got.Reason)
		})
	}
}

// TestAbstain pins every path that refuses to name a file: no selection, no
// basis, and the typed diagnostics that explain why.
func TestAbstain(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name      string
		entries   []Entry
		ctx       Context
		wantW     int
		wantP     int
		wantDiags []Diagnostic
	}{
		{name: "fractional label", entries: []Entry{mk("Show - 10.5.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 10, ExpectedNextSet: true, ExpectedNext: 11}, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticAmbiguity, Basename: "Show - 10.5.mp4", Detail: "fractional"}}},
		{name: "special redefines ordinal", entries: []Entry{mk("Harbor Lights - SP02.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 1, ExpectedNextSet: true, ExpectedNext: 2}, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticAmbiguity, Basename: "Harbor Lights - SP02.mp4", Episode: 2, Detail: "special"}}},
		{name: "year noise stays opaque", entries: []Entry{mk("Show 2024.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 0}, wantP: 1},
		{name: "fractional progress", entries: []Entry{mk("Show - 13.mp4", "1", "2"), mk("Show - 14.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12.5}, wantP: 2,
			wantDiags: []Diagnostic{{Kind: DiagnosticUnusableContext, Detail: "progress"}}},
		{name: "negative progress", entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: -1}, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticUnusableContext, Detail: "progress"}}},
		{name: "no context", entries: []Entry{mk("Yani Neko - 10.mp4", "1", "2")}, wantP: 1},
		{name: "duplicate suspends every claimant", entries: []Entry{mk("Harbor Lights - 13.mp4", "1", "2"), mk("Harbor Lights EP13.mp4", "3", "4"), mk("x-cut.mp4", "5", "6")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 3,
			wantDiags: []Diagnostic{
				{Kind: DiagnosticDuplicate, Basename: "Harbor Lights - 13.mp4", Episode: 13},
				{Kind: DiagnosticDuplicate, Basename: "Harbor Lights EP13.mp4", Episode: 13},
			}},
		{name: "duplicate watched prefix blocks elimination", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show EP02.mp4", "5", "6"), mk("finale.mp4", "7", "8")},
			ctx: Context{ProgressSet: true, Progress: 2, ExpectedNextSet: true, ExpectedNext: 3}, wantW: 1, wantP: 3,
			wantDiags: []Diagnostic{
				{Kind: DiagnosticDuplicate, Basename: "Show - 02.mp4", Episode: 2},
				{Kind: DiagnosticDuplicate, Basename: "Show EP02.mp4", Episode: 2},
			}},
		{name: "zero ordinal breaks the prefix", entries: []Entry{mk("Show - 00.mp4", "1", "2"), mk("Show - 01.mp4", "3", "4"), mk("Show - 02.mp4", "5", "6"), mk("finale.mp4", "7", "8")},
			ctx: Context{ProgressSet: true, Progress: 3}, wantW: 3, wantP: 1},
		{name: "reconcile suspends chronology collisions", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show - 03.mp4", "5", "6"), mk("Show - 04.mp4", "7", "8"), mk("Show - 05.mp4", "9", "10"), mk("a-cut.mp4", "11", "12"), mk("b-cut.mp4", "13", "14")},
			ctx: Context{ProgressSet: true, Progress: 5, ExpectedNextSet: true, ExpectedNext: 3}, wantW: 5, wantP: 2,
			wantDiags: []Diagnostic{
				{Kind: DiagnosticDuplicate, Basename: "Show - 03.mp4", Episode: 3},
				{Kind: DiagnosticDuplicate, Basename: "Show - 04.mp4", Episode: 4},
				{Kind: DiagnosticDuplicate, Basename: "a-cut.mp4", Episode: 3},
				{Kind: DiagnosticDuplicate, Basename: "b-cut.mp4", Episode: 4},
			}},
		{name: "range abstains", entries: []Entry{mk("Harbor Lights - 07-08.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7}, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticAmbiguity, Basename: "Harbor Lights - 07-08.mp4", Detail: "range"}}},
		{name: "boundary special abstains", entries: []Entry{mk("Show SP - 05.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 4, ExpectedNextSet: true, ExpectedNext: 5}, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticAmbiguity, Basename: "Show SP - 05.mp4", Episode: 5, Detail: "special"}}},
		{name: "dev tail is version noise", entries: []Entry{mk("dev 7.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7}, wantP: 1},
		{name: "codec tail stays opaque", entries: []Entry{mk("xh 264.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 263, ExpectedNextSet: true, ExpectedNext: 264}, wantP: 1},
		{name: "equal mtimes abstain", entries: []Entry{mk("a-cut.mp4", "1", "5"), mk("b-cut.mp4", "3", "5")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "negative birth abstains", entries: []Entry{mk("a-cut.mp4", "-7", "2"), mk("b-cut.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "absurd progress is unusable", entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 1 << 30}, wantW: 1},
		{name: "tag conflict", entries: []Entry{{Basename: "Show - 13.mp4", BirthNs: "1", MtimeNs: "2", Tags: []string{"14"}}},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticAmbiguity, Basename: "Show - 13.mp4", Detail: "conflict"}}},
		{name: "changed entry never accepted", entries: []Entry{{Basename: "Show - 13.mp4", BirthNs: "1", MtimeNs: "2", Changed: true}, mk("Show - 14.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "read error never accepted", entries: []Entry{{Basename: "Show - 13.mp4", BirthNs: "1", MtimeNs: "2", Err: "access denied"}, mk("Show - 14.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "lone file never becomes episode one", entries: []Entry{mk("finale.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 0}, wantP: 1},
		{name: "gapped prefix blocks elimination", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("finale.mp4", "5", "6")},
			ctx: Context{ProgressSet: true, Progress: 3}, wantW: 2, wantP: 1},
		{name: "contradicting expectation blocks elimination", entries: []Entry{mk("Show - 01.mp4", "1", "2"), mk("Show - 02.mp4", "3", "4"), mk("Show - 03.mp4", "5", "6"), mk("finale.mp4", "7", "8")},
			ctx: Context{ProgressSet: true, Progress: 3, ExpectedNextSet: true, ExpectedNext: 5}, wantW: 3, wantP: 1},
		{name: "two opaque beside numbered stays unresolved", entries: []Entry{mk("Show - 14.mp4", "1", "2"), mk("a-cut.mp4", "3", "4"), mk("b-cut.mp4", "5", "6")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 3},
		{name: "tied chronology abstains", entries: []Entry{mk("a-cut.mp4", "1", "2"), mk("b-cut.mp4", "1", "3")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "missing stamp abstains", entries: []Entry{mk("a-cut.mp4", "", "2"), mk("b-cut.mp4", "3", "4")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "inverted chronology abstains", entries: []Entry{mk("a-cut.mp4", "1", "4"), mk("b-cut.mp4", "3", "2")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 2},
		{name: "requested missing never falls back", entries: []Entry{mk("Show - 14.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}, wantP: 1},
		{name: "watched target never reselects", entries: []Entry{mk("Show - 01.mp4", "1", "2")},
			ctx: Context{ProgressSet: true, Progress: 5, ExpectedNextSet: true, ExpectedNext: 1}, wantW: 1},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := New().Identify(Request{Entries: tc.entries, Context: tc.ctx})
			if got.Next != nil {
				t.Fatalf("next = %+v, want abstention", got.Next)
			}
			if got.Basis != BasisNone {
				t.Errorf("basis = %q, want none", got.Basis)
			}
			if got.Watched != tc.wantW || got.Pending != tc.wantP {
				t.Errorf("watched/pending = %d/%d, want %d/%d", got.Watched, got.Pending, tc.wantW, tc.wantP)
			}
			if !slices.Equal(got.Diagnostics, tc.wantDiags) {
				t.Errorf("diagnostics = %+v, want %+v", got.Diagnostics, tc.wantDiags)
			}
			assertReasonShape(t, got.Reason)
		})
	}
}

// TestImmutableInput proves the decision never writes through the request.
func TestImmutableInput(t *testing.T) {
	t.Parallel()
	req := Request{
		Entries: []Entry{
			{Basename: "Show - 14.mp4", BirthNs: "3", MtimeNs: "4", Tags: []string{"14"}},
			{Basename: "Show - 13.mp4", BirthNs: "1", MtimeNs: "2"},
		},
		Context: Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13},
	}
	before := reflect.ValueOf(req).Interface()
	New().Identify(req)
	if !reflect.DeepEqual(req, before) {
		t.Error("Identify mutated its input")
	}
}

// TestPermutationStability proves input order never changes the decision.
func TestPermutationStability(t *testing.T) {
	t.Parallel()
	entries := []Entry{mk("Show - 13.mp4", "1", "2"), mk("Show - 14.mp4", "3", "4"), mk("a-cut.mp4", "5", "6")}
	ctx := Context{ProgressSet: true, Progress: 12, ExpectedNextSet: true, ExpectedNext: 13}
	forward := New().Identify(Request{Entries: entries, Context: ctx})
	reversed := New().Identify(Request{Entries: []Entry{entries[2], entries[1], entries[0]}, Context: ctx})
	if !reflect.DeepEqual(forward, reversed) {
		t.Errorf("permuted input changed the decision: %+v vs %+v", forward, reversed)
	}
}
