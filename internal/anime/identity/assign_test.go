package identity

import (
	"slices"
	"testing"
)

// TestAssign pins the whole-folder outcome: assigned pairs in episode order
// and every other file with its typed reason in basename order.
func TestAssign(t *testing.T) {
	t.Parallel()
	rows := []struct {
		name        string
		entries     []Entry
		ctx         Context
		wantAssign  []Selection
		wantSkipped []Diagnostic
	}{
		{name: "empty folder"},
		{name: "clean folder in episode order", entries: []Entry{mk("B - 01.mkv", "", ""), mk("A - 02.mkv", "", ""), mk("C - 03.mkv", "", "")},
			wantAssign: []Selection{{1, "B - 01.mkv"}, {2, "A - 02.mkv"}, {3, "C - 03.mkv"}}},
		{name: "half episode skipped as fractional", entries: []Entry{mk("Show - 10.5.mkv", "", ""), mk("Show - 10.mkv", "", "")},
			wantAssign:  []Selection{{10, "Show - 10.mkv"}},
			wantSkipped: []Diagnostic{{Kind: DiagnosticAmbiguity, Basename: "Show - 10.5.mkv", Detail: "fractional"}}},
		{name: "two files for one episode", entries: []Entry{mk("B - 05.mkv", "", ""), mk("A - 06.mkv", "", ""), mk("A - 05.mkv", "", "")},
			wantAssign: []Selection{{6, "A - 06.mkv"}},
			wantSkipped: []Diagnostic{
				{Kind: DiagnosticDuplicate, Basename: "A - 05.mkv", Episode: 5},
				{Kind: DiagnosticDuplicate, Basename: "B - 05.mkv", Episode: 5}}},
		{name: "non-episode files", entries: []Entry{
			mk("Harbor Lights - 07-08.mp4", "", ""), mk("Harbor Lights - SP02.mp4", "", ""),
			{Basename: "Show - 04.mkv", Tags: []string{"05"}}, mk("Show.mkv", "", ""),
			{Basename: "Show - 09.mkv", Err: "denied"}, {Basename: "Show - 11.mkv", Changed: true}},
			wantSkipped: []Diagnostic{
				{Kind: DiagnosticAmbiguity, Basename: "Harbor Lights - 07-08.mp4", Detail: "range"},
				{Kind: DiagnosticAmbiguity, Basename: "Harbor Lights - SP02.mp4", Episode: 2, Detail: "special"},
				{Kind: DiagnosticAmbiguity, Basename: "Show - 04.mkv", Detail: "conflict"},
				{Kind: DiagnosticUnreadable, Basename: "Show - 09.mkv"},
				{Kind: DiagnosticUnreadable, Basename: "Show - 11.mkv"},
				{Kind: DiagnosticUnnumbered, Basename: "Show.mkv"}}},
		{name: "watched files stay assigned", entries: []Entry{mk("Show - 02.mkv", "", ""), mk("Show - 01.mkv", "", "")}, ctx: ContextForProgress(1),
			wantAssign: []Selection{{1, "Show - 01.mkv"}, {2, "Show - 02.mkv"}}},
		{name: "empty context assigns clear numbers only", entries: []Entry{mk("Show - 01.mkv", "", ""), mk("opaque.mkv", "", "")},
			wantAssign:  []Selection{{1, "Show - 01.mkv"}},
			wantSkipped: []Diagnostic{{Kind: DiagnosticUnnumbered, Basename: "opaque.mkv"}}},
		{name: "progress context admits elimination", entries: []Entry{mk("Show - 01.mkv", "", ""), mk("opaque.mkv", "", "")}, ctx: ContextForProgress(1),
			wantAssign: []Selection{{1, "Show - 01.mkv"}, {2, "opaque.mkv"}}},
		{name: "progress context admits chronology", entries: []Entry{mk("b.mkv", "20", "21"), mk("a.mkv", "10", "11")}, ctx: ContextForProgress(4),
			wantAssign: []Selection{{5, "a.mkv"}, {6, "b.mkv"}}},
	}
	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := NewAssigner().Assign(Request{Entries: tc.entries, Context: tc.ctx})
			if !slices.Equal(got.Assigned, tc.wantAssign) {
				t.Errorf("assigned = %+v, want %+v", got.Assigned, tc.wantAssign)
			}
			if !slices.Equal(got.Skipped, tc.wantSkipped) {
				t.Errorf("skipped = %+v, want %+v", got.Skipped, tc.wantSkipped)
			}
		})
	}
}

// TestAssignAgreesWithIdentify asserts, over both interview corpora, that
// every non-ambiguous Identify selection appears in Assign for the same
// request, and that Assign accounts for every entry exactly once.
func TestAssignAgreesWithIdentify(t *testing.T) {
	t.Parallel()
	selections := 0
	for _, file := range []string{"interview-eval-dev.json", "interview-eval-supplemental.json"} {
		for _, c := range readCorpus(t, file) {
			req := corpusRequest(c)
			got := NewAssigner().Assign(req)
			if n := len(got.Assigned) + len(got.Skipped); n != len(req.Entries) {
				t.Errorf("%s: accounted for %d of %d entries", c.ID, n, len(req.Entries))
			}
			res := New().Identify(req)
			if res.Next == nil || slices.ContainsFunc(res.Diagnostics, isAmbiguity) {
				continue
			}
			selections++
			if !slices.Contains(got.Assigned, *res.Next) {
				t.Errorf("%s: Identify selected %+v, Assign = %+v", c.ID, *res.Next, got.Assigned)
			}
		}
	}
	if selections != 11 {
		t.Errorf("checked %d selections, want 11", selections)
	}
}

// isAmbiguity mirrors the Today confidence gate.
func isAmbiguity(d Diagnostic) bool { return d.Kind == DiagnosticAmbiguity }

// TestIdentifyNeverEmitsAssignKinds asserts that the skip-only kinds stay out
// of Identify's diagnostics, over both interview corpora plus one abstaining
// folder that holds an unreadable, a changed and an unnumbered file.
func TestIdentifyNeverEmitsAssignKinds(t *testing.T) {
	t.Parallel()
	reqs := []Request{{Entries: []Entry{
		{Basename: "Show - 09.mkv", Err: "denied"}, {Basename: "Show - 11.mkv", Changed: true}, mk("Show.mkv", "", "")}}}
	for _, file := range []string{"interview-eval-dev.json", "interview-eval-supplemental.json"} {
		for _, c := range readCorpus(t, file) {
			reqs = append(reqs, corpusRequest(c))
		}
	}
	for _, req := range reqs {
		for _, d := range New().Identify(req).Diagnostics {
			if d.Kind == DiagnosticUnreadable || d.Kind == DiagnosticUnnumbered {
				t.Errorf("Identify emitted %+v", d)
			}
		}
	}
}
