package download

import (
	"context"
	"encoding/json"
	"testing"
)

// hosterAttemptLedger runs one fallback chain and returns the recorded log entries. The counter
// starts one episode ahead recursively, so the second hoster's completion poll flattens it into
// place and reports success -- the shape that puts a WINNING attempt in the ledger.
func hosterAttemptLedger(t *testing.T, jd *fallbackAwareJDClient) (*fieldsRecorder, bool, string) {
	t.Helper()
	folder := t.TempDir()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 1}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	deps.JD = jd
	recorder := &fieldsRecorder{}
	deps.Logger = recorder
	s := NewService(deps)

	ordered := []hosterLink{
		{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}},
		{hoster: "Mega", links: []string{"http://mega.example/1"}},
	}
	enqueued, failureKind := s.enqueueWithFallback(context.Background(), "run-1", testAnime(folder), ordered, 12)
	return recorder, enqueued, failureKind
}

// assertAttempt checks one ledger row against the hoster, index and outcome it must carry.
func assertAttempt(t *testing.T, entry recordedEntry, hoster string, attemptIndex int, outcome string) {
	t.Helper()
	if entry.level != "info" {
		t.Fatalf("expected the per-attempt ledger to persist at info level, got %q", entry.level)
	}
	if entry.metadata["hoster"] != hoster {
		t.Fatalf("expected hoster %q, got %#v", hoster, entry.metadata["hoster"])
	}
	if entry.metadata["attemptIndex"] != attemptIndex {
		t.Fatalf("expected attemptIndex %d for hoster %q, got %#v", attemptIndex, hoster, entry.metadata["attemptIndex"])
	}
	if entry.metadata["outcome"] != outcome {
		t.Fatalf("expected outcome %q for hoster %q, got %#v", outcome, hoster, entry.metadata["outcome"])
	}
}

func TestEnqueueErrorAndWinningHosterBothAppearInTheAttemptLedger(t *testing.T) {
	t.Parallel()

	// The enqueue-error path continues to the next hoster WITHOUT reaching the outcome switch,
	// so a ledger written only at the switch would silently lose this row.
	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, failHoster: "Mediafire"}

	recorder, enqueued, _ := hosterAttemptLedger(t, jd)

	if !enqueued {
		t.Fatal("expected the second hoster to succeed, so the ledger has a winning attempt to record")
	}
	entries := recorder.byEventType("download.hoster_attempt")
	if len(entries) != 2 {
		t.Fatalf("expected exactly 1 ledger entry per attempted hoster, got %d", len(entries))
	}
	assertAttempt(t, entries[0], "Mediafire", 0, "enqueue_error")
	assertAttempt(t, entries[1], "Mega", 1, "success")
}

func TestDeadFirstHosterAndSuccessfulFallbackAreBothRecordedInOrder(t *testing.T) {
	t.Parallel()

	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true}}

	recorder, enqueued, _ := hosterAttemptLedger(t, jd)

	if !enqueued {
		t.Fatal("expected the fallback hoster to succeed")
	}
	entries := recorder.byEventType("download.hoster_attempt")
	if len(entries) != 2 {
		t.Fatalf("expected exactly 2 ledger entries across the fallback chain, got %d", len(entries))
	}
	assertAttempt(t, entries[0], "Mediafire", 0, "dead")
	assertAttempt(t, entries[1], "Mega", 1, "success")
}

func TestTheLedgerIsAdditiveAndNeverReplacesTheFailureTaxonomy(t *testing.T) {
	t.Parallel()

	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true, "Mega": true}}

	recorder, enqueued, failureKind := hosterAttemptLedger(t, jd)

	if enqueued {
		t.Fatal("expected an all-dead chain to report failure")
	}
	if failureKind != "hoster_down" {
		t.Fatalf("expected the exhausted chain to keep classifying as hoster_down, got %q", failureKind)
	}
	failures := recorder.byEventType("download.failed")
	if len(failures) != 2 {
		t.Fatalf("expected the failure taxonomy to still emit once per dead hoster, got %d", len(failures))
	}
	for i, failure := range failures {
		if failure.level != "warn" {
			t.Fatalf("expected failure-taxonomy entry %d to stay at warn level, got %q", i, failure.level)
		}
		if failure.metadata["failureKind"] != "hoster_down" {
			t.Fatalf("expected failure-taxonomy entry %d to keep failureKind hoster_down, got %#v", i, failure.metadata["failureKind"])
		}
	}
	if got := len(recorder.byEventType("download.hoster_attempt")); got != 2 {
		t.Fatalf("expected the ledger to be an ADDITIONAL record of 2 attempts, got %d", got)
	}
}

func TestHosterAttemptMetadataStaysUnderThePersistenceBound(t *testing.T) {
	t.Parallel()

	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true}}

	recorder, _, _ := hosterAttemptLedger(t, jd)

	assertMetadataUnderBound(t, recorder)
}

// assertMetadataUnderBound marshals every captured metadata map and pins it under the persistence
// bound, written as a literal because the bound belongs to another package and asserting against
// the very constant under test would prove nothing.
func assertMetadataUnderBound(t *testing.T, recorder *fieldsRecorder) {
	t.Helper()
	entries := recorder.all()
	if len(entries) == 0 {
		t.Fatal("expected the scenario to record at least one entry to bound")
	}
	for _, entry := range entries {
		if entry.metadata == nil {
			continue
		}
		encoded, err := json.Marshal(entry.metadata)
		if err != nil {
			t.Fatalf("expected %s metadata to marshal, got %v", entry.eventType, err)
		}
		if len(encoded) >= 4096 {
			t.Fatalf("expected %s metadata under the 4096-byte bound, got %d bytes", entry.eventType, len(encoded))
		}
	}
}

func TestTheFirstHosterAndAFallbackAreClassifiedDifferentlyAtTheSameDeadEnd(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 0}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	// An unmatched status is neither dead nor positively alive, so BOTH hosters reach the same
	// post-grace dead end and only their position in the chain separates them.
	jd := &stagedJDClient{svcFakeJDClient: &svcFakeJDClient{}}
	deps.JD = jd
	deps.DetectStartPhaseDisabled = false
	deps.HasPartFiles = func(string) bool { return false }
	recorder := &fieldsRecorder{}
	deps.Logger = recorder
	s := NewService(deps)

	ordered := []hosterLink{
		{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}},
		{hoster: "Mega", links: []string{"http://mega.example/1"}},
	}

	enqueued, failureKind := s.enqueueWithFallback(context.Background(), "run-1", testAnime(folder), ordered, 12)

	if enqueued {
		t.Fatal("expected an episode that never landed to report failure")
	}
	if failureKind != "slow_or_timeout" {
		t.Fatalf("expected the LAST hoster's timeout to set the classification, got %q", failureKind)
	}
	entries := recorder.byEventType("download.hoster_attempt")
	if len(entries) != 2 {
		t.Fatalf("expected one ledger entry per attempt, got %d", len(entries))
	}
	assertAttempt(t, entries[0], "Mediafire", 0, "dead")
	assertAttempt(t, entries[1], "Mega", 1, "timeout")

	removals := recorder.byEventType("download.jd_removed")
	if len(removals) != 1 {
		t.Fatalf("expected only the first hoster's dead end to destroy its packages, got %d removals", len(removals))
	}
	if removals[0].metadata["hoster"] != "Mediafire" || removals[0].metadata["stage"] != "grace_no_signal_first" {
		t.Fatalf("expected the removal to be attributed to the FIRST hoster's no-signal dead end, got %#v", removals[0].metadata)
	}
}
