package identity

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// tally is what one corpus reports about the pairing between a basis and a selection.
type tally struct {
	decided   int
	abstained int
	ambiguous int
}

// TestCorpusKeepsTheBasisAndSelectionPairing gives the port's documented invariant a machine owner:
// BasisNone always pairs with a nil Next, and a non-nil Next therefore never carries BasisNone.
//
// The same run logs how often a decision arrives together with an ambiguity diagnostic, which is the
// number the ODD 3.2 confidence gate depends on. It is logged rather than asserted: a future corpus
// case that pairs a decision with ambiguity would be a new case to decide about, not a broken
// contract, so it must not turn this test red.
func TestCorpusKeepsTheBasisAndSelectionPairing(t *testing.T) {
	t.Parallel()

	id := New()
	for _, split := range []string{"dev", "supplemental"} {
		corpus := loadCorpus(t, split)
		counts := tallyCorpus(t, split, id, corpus.Cases)
		t.Logf("SPLIT %s: casos=%d decididos=%d abstenidos=%d decididos-con-ambiguedad=%d",
			split, len(corpus.Cases), counts.decided, counts.abstained, counts.ambiguous)
	}
}

// loadCorpus decodes one interview corpus from this package's testdata.
func loadCorpus(t *testing.T, split string) corpusFile {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", "interview-eval-"+split+".json"))
	if err != nil {
		t.Fatalf("read corpus %s: %v", split, err)
	}
	var corpus corpusFile
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatalf("decode corpus %s: %v", split, err)
	}
	return corpus
}

// tallyCorpus checks the pairing invariant on every case and counts the outcomes.
func tallyCorpus(t *testing.T, split string, id Identifier, cases []corpusCase) tally {
	t.Helper()

	var counts tally
	for _, c := range cases {
		got := id.Identify(corpusRequest(c))
		assertPairing(t, split, c.ID, got)

		if got.Next == nil {
			counts.abstained++
			continue
		}
		counts.decided++
		if hasAmbiguity(got.Diagnostics) {
			counts.ambiguous++
		}
	}
	return counts
}

// assertPairing fails when one decision breaks the documented pairing between BasisNone and a nil
// selection.
func assertPairing(t *testing.T, split, caseID string, got Result) {
	t.Helper()

	if got.Next == nil && got.Basis != BasisNone {
		t.Errorf("%s: %s abstains but reports basis %q", split, caseID, got.Basis)
	}
	if got.Next != nil && got.Basis == BasisNone {
		t.Errorf("%s: %s selects %q but reports BasisNone", split, caseID, got.Next.Basename)
	}
}

// hasAmbiguity reports whether any diagnostic is the ambiguity kind.
func hasAmbiguity(diagnostics []Diagnostic) bool {
	for _, d := range diagnostics {
		if d.Kind == DiagnosticAmbiguity {
			return true
		}
	}
	return false
}
