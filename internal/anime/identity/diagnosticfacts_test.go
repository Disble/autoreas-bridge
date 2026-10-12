package identity

import (
	"slices"
	"testing"
)

// TestDiagnosticFacts pins the typed diagnostic FACTS a decision must carry,
// with the counterexamples an independent verifier used to show that a
// surviving mutant can drop or invent one. Diagnostics are typed values, not
// prose, so asserting them is behaviour coverage rather than wording.
func TestDiagnosticFacts(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name      string
		entries   []Entry
		ctx       Context
		wantEp    int
		wantBase  string
		wantW     int
		wantP     int
		wantDiags []Diagnostic
	}{
		// D1: equal birth and modification times are not an inversion. A mutant
		// that accepts equality as "greater" invents the fact.
		{name: "equal timestamps invent no inversion", entries: []Entry{mk("Show - 07.mp4", "3", "3")},
			ctx:    Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7},
			wantEp: 7, wantBase: "Show - 07.mp4", wantP: 1},
		// D2: a watched earlier episode created LATER than the winner is an
		// inversion the clear number beat, and the fact must survive. Two
		// mutants remove it: zeroing the older-ordinal arm, and testing the
		// birth comparison against one instead of zero.
		{name: "earlier ordinal with later birth keeps the inversion", entries: []Entry{mk("Show - 06.mp4", "9", "10"), mk("Show - 07.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7},
			wantEp: 7, wantBase: "Show - 07.mp4", wantW: 1, wantP: 1,
			wantDiags: []Diagnostic{{Kind: DiagnosticInversion, Basename: "Show - 07.mp4", Episode: 7, Detail: "Show - 06.mp4"}}},
		// D3: an unreadable birth must be skipped, not terminate the scan. A
		// mutant that breaks instead of continuing loses every later fact.
		{name: "unreadable birth does not stop the scan", entries: []Entry{mk("Show - 08.mp4", "", "10"), mk("Show - 06.mp4", "9", "10"), mk("Show - 07.mp4", "1", "2")},
			ctx:    Context{ProgressSet: true, Progress: 6, ExpectedNextSet: true, ExpectedNext: 7},
			wantEp: 7, wantBase: "Show - 07.mp4", wantW: 1, wantP: 2,
			wantDiags: []Diagnostic{{Kind: DiagnosticInversion, Basename: "Show - 07.mp4", Episode: 7, Detail: "Show - 06.mp4"}}},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := New().Identify(Request{Entries: tc.entries, Context: tc.ctx})
			if got.Next == nil || got.Next.Episode != tc.wantEp || got.Next.Basename != tc.wantBase {
				t.Fatalf("next = %+v, want episode=%d basename=%q", got.Next, tc.wantEp, tc.wantBase)
			}
			if got.Watched != tc.wantW || got.Pending != tc.wantP {
				t.Errorf("watched/pending = %d/%d, want %d/%d", got.Watched, got.Pending, tc.wantW, tc.wantP)
			}
			if !slices.Equal(got.Diagnostics, tc.wantDiags) {
				t.Errorf("diagnostics = %+v, want %+v", got.Diagnostics, tc.wantDiags)
			}
		})
	}
}
