package identity

import (
	"testing"
)

// selection renders a decision's selected file, or "none".
func selection(r Result) string {
	if r.Next == nil {
		return "none"
	}
	return r.Next.Basename
}

func TestContextForProgressDerivesTheCursorConvention(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name     string
		progress float64
		wantSet  bool
		want     float64
	}{
		{name: "nothing watched yet expects the first episode", progress: 0, wantSet: true, want: 1},
		{name: "a whole progress expects the next one", progress: 12, wantSet: true, want: 13},
		{name: "a fractional progress names no whole next episode", progress: 12.5, wantSet: false},
	} {
		got := ContextForProgress(tc.progress)
		if !got.ProgressSet || got.Progress != tc.progress {
			t.Errorf("%s: progress must travel as it is stored: set=%v value=%v", tc.name, got.ProgressSet, got.Progress)
		}
		if got.ExpectedNextSet != tc.wantSet {
			t.Errorf("%s: expectedNext set: want %v, got %v", tc.name, tc.wantSet, got.ExpectedNextSet)
			continue
		}
		if tc.wantSet && got.ExpectedNext != tc.want {
			t.Errorf("%s: expectedNext: want %v, got %v", tc.name, tc.want, got.ExpectedNext)
		}
	}
}

// TestContextForProgressMovesNoCuratedDecision keeps the derivation honest against the real interview
// corpora: offering the cursor convention as a hypothesis must never change a decision the curated
// cases recorded, including the ones that deliberately carried no expectation.
func TestContextForProgressMovesNoCuratedDecision(t *testing.T) {
	t.Parallel()

	id := New()
	moved, evaluated := 0, 0

	for _, split := range []string{"dev", "supplemental"} {
		corpus := loadCorpus(t, split)

		for _, c := range corpus.Cases {
			progress, progressSet := corpusNumber(c.Snapshot.Context.Progress)
			if !progressSet {
				// A caller with no stored progress has no expectation to derive.
				continue
			}

			request := corpusRequest(c)
			request.Context = ContextForProgress(progress)
			evaluated++

			got := selection(id.Identify(request))
			if want := selection(id.Identify(corpusRequest(c))); got != want {
				moved++
				t.Errorf("%s/%s: the derived hypothesis moved the decision from %q to %q",
					split, c.ID, want, got)
			}
		}
	}

	t.Logf("corpus cases evaluated with the derived hypothesis: %d, decisions moved: %d", evaluated, moved)
}
