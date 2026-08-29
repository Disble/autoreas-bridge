package download

import (
	"context"
	"testing"
	"time"
)

// recheckCounters builds the episode counters one post-grace re-check attempt starts from.
//
// The two bases are set independently on purpose. Production can never hold atRoot > recursive,
// because CountRecursive walks the very root CountAtRoot reads -- but a residue fixture MUST be
// able to start recursive ABOVE the episode's root baseline, and that is the only state which
// separates an attempt-scoped recursive baseline from the episode-scoped root one.
func recheckCounters(folder string, atRoot, recursive int) *svcFakeCounter {
	return &svcFakeCounter{atRoot: map[string]int{folder: atRoot}, recursive: map[string]int{folder: recursive}}
}

// recheckAttempt runs one hoster attempt whose detect phase never sees transfer evidence and whose
// JD answers are inconclusive at both queries, so the attempt reaches the post-grace evaluation
// against a baseline of 4.
//
// landDuringGrace moves the RECURSIVE count alone on the last probe of the 60s grace. That is the
// blind gap this re-check exists to see -- the downloader wrote into its own package subfolder,
// which Flatten never reaches past one level -- and moving only the recursive basis is what makes
// a root-basis implementation fail these tests instead of passing them by accident.
func recheckAttempt(t *testing.T, folder string, counter *svcFakeCounter, landDuringGrace, isFirstHoster bool) (hosterOutcome, *fieldsRecorder, *stagedJDClient) {
	t.Helper()
	now := time.Now()
	jd := &stagedJDClient{svcFakeJDClient: &svcFakeJDClient{}, answers: []jdAnswer{
		{status: aliveStatus},
		{status: aliveStatus},
	}}
	probes := 0
	s, recorder := newProbeWatchService(t, jd, counter, &now, func(string) bool {
		probes++
		if landDuringGrace && probes == 3 {
			counter.mu.Lock()
			defer counter.mu.Unlock()
			counter.recursive[folder]++
		}
		return false
	})
	// NewService defaults RenameEpisodes to false, and a success that never renames cannot show
	// whether completion handling ran at all.
	s.deps.RenameEpisodes = func(context.Context) bool { return true }
	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, isFirstHoster)
	return outcome, recorder, jd
}

// assertNoPackageRemoval fails when the attempt removed the downloader package.
//
// jdRemove logs download.jd_removed unconditionally BEFORE calling RemoveByDestination, so an
// absent entry is itself proof that no removal site was even reached; the client's own record
// closes the loop. Both together are what fail when the re-check is moved after the JD evaluation.
func assertNoPackageRemoval(t *testing.T, recorder *fieldsRecorder, jd *stagedJDClient) {
	t.Helper()
	if got := len(recorder.byEventType("download.jd_removed")); got != 0 {
		t.Fatalf("expected a disk-confirmed success to reach no removal site at all, got %d download.jd_removed entries", got)
	}
	if got := jd.removedDestinations(); len(got) != 0 {
		t.Fatalf("expected the downloader package to survive a disk-confirmed success, got removals %v", got)
	}
}

// assertFellThroughToRemoval pins the untouched post-grace path: an inconclusive status on the
// first hoster still ends in a dead verdict and still removes the package exactly once.
func assertFellThroughToRemoval(t *testing.T, outcome hosterOutcome, recorder *fieldsRecorder, jd *stagedJDClient) {
	t.Helper()
	assertOutcome(t, outcome, hosterOutcomeDead, "grace_no_signal_first")
	if got := len(recorder.byEventType("download.jd_removed")); got != 1 {
		t.Fatalf("expected the fall-through to record exactly 1 removal, got %d download.jd_removed entries", got)
	}
	if got := jd.removedDestinations(); len(got) != 1 {
		t.Fatalf("expected the fall-through to remove the package exactly once, got %v", got)
	}
}

// assertSameEntryShape fails unless two recorded entries agree on event type, level and metadata
// KEY SET. Values are deliberately not compared: two attempts record different probe offsets while
// the shape is what must not diverge, and comparing values would pin the wrong thing.
func assertSameEntryShape(t *testing.T, a, b recordedEntry) {
	t.Helper()
	if a.eventType != b.eventType || a.level != b.level {
		t.Fatalf("expected one carrier at one level, got %q/%q and %q/%q", a.eventType, a.level, b.eventType, b.level)
	}
	if len(a.metadata) != len(b.metadata) {
		t.Fatalf("expected the same metadata key set, got %#v and %#v", a.metadata, b.metadata)
	}
	for key := range a.metadata {
		if _, ok := b.metadata[key]; !ok {
			t.Fatalf("expected key %q on both entries, got %#v and %#v", key, a.metadata, b.metadata)
		}
	}
}

// --- the post-grace disk re-check ---

func TestAFileThatLandsInsideTheBlindGapProducesADiskConfirmedSuccess(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4, 4), true, true)

	// Only the recursive count moved, so a comparison taken on the destination ROOT sees nothing
	// here and falls through to a dead verdict. That is the whole case this guard exists for.
	assertOutcome(t, outcome, hosterOutcomeSuccess, "grace_disk_confirmed")
	assertNoPackageRemoval(t, recorder, jd)
}

func TestAnAttemptWhereNothingLandsFallsThroughUnchanged(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4, 4), false, true)

	// Equality is not a landing. The comparison is strictly greater-than, so an unchanged count
	// must leave every downstream decision exactly where it stood, the removal included.
	assertFellThroughToRemoval(t, outcome, recorder, jd)
}

func TestPreExistingSubfolderResidueDoesNotProduceASuccess(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	// recursive 6 over a root baseline of 4 is an earlier failed attempt's leftovers sitting in a
	// package subfolder Flatten never reaches. Comparing the post-grace recursive reading against
	// the EPISODE's root baseline would read that residue as this attempt's work and advance the
	// catch-up cursor past an episode nobody downloaded -- silent, permanent, and never retried.
	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4, 6), false, true)

	assertFellThroughToRemoval(t, outcome, recorder, jd)
}

func TestADiskConfirmedSuccessIsIndependentOfChainPosition(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	// The three post-grace dead-end pairs split first-hoster from fallback because their KIND
	// differs by position. A success does not: a file that landed is a file that landed, so the
	// fallback attempt reports the same exit rather than the timeout its dead-end twin would.
	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4, 4), true, false)

	assertOutcome(t, outcome, hosterOutcomeSuccess, "grace_disk_confirmed")
	assertNoPackageRemoval(t, recorder, jd)
}

// --- the probe timeline the re-check short-circuits past ---

func TestADiskConfirmedAttemptStillPersistsItsProbeTimeline(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	_, recorder, _ := recheckAttempt(t, folder, recheckCounters(folder, 4, 4), true, true)

	// The JD evaluation is what persists this timeline on the failed-detect path, and the
	// re-check returns before it runs. Losing the entry would blind the probe instrument on
	// exactly the case it was built to observe.
	entry := recorder.only(t, "download.detect_start_failed")
	if entry.level != "warn" {
		t.Fatalf("expected the probe timeline to persist at warn level, got %q", entry.level)
	}
	probes := metadataProbes(t, entry)
	if len(probes) != 3 {
		t.Fatalf("expected the exhausted grace to persist 3 probes, got %#v", probes)
	}
	for i, p := range probes {
		if p["found"] != false {
			t.Fatalf("expected every probe of a missed transfer to report found=false, got probe %d: %#v", i, p)
		}
	}
}

func TestTheProbeCarrierKeepsTheShapeItHasOnTheFailedDetectPath(t *testing.T) {
	t.Parallel()

	confirmed := "folder-" + t.Name() + "-confirmed"
	fallThrough := "folder-" + t.Name() + "-fallthrough"

	_, confirmedRecorder, _ := recheckAttempt(t, confirmed, recheckCounters(confirmed, 4, 4), true, true)
	_, fallThroughRecorder, _ := recheckAttempt(t, fallThrough, recheckCounters(fallThrough, 4, 4), false, true)

	// One helper emits both, so identity is structural rather than something this test has to
	// police -- but a second emission site reintroduced later would show up here first.
	assertSameEntryShape(t,
		confirmedRecorder.only(t, "download.detect_start_failed"),
		fallThroughRecorder.only(t, "download.detect_start_failed"))
}

func TestProbeOffsetsStillAdvanceOnTheDiskConfirmedPath(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	_, recorder, _ := recheckAttempt(t, folder, recheckCounters(folder, 4, 4), true, true)

	// A fixed clock makes this guard's own tests pass while measuring nothing, and the offsets are
	// where that shows: under a frozen clock every probe records the same number.
	probes := metadataProbes(t, recorder.only(t, "download.detect_start_failed"))
	previous := int64(-1)
	for i := range probes {
		elapsed := probeOffset(t, probes, i)
		if elapsed <= previous {
			t.Fatalf("expected strictly increasing probe offsets under a moving clock, got %#v", probes)
		}
		previous = elapsed
	}
	if got := probeOffset(t, probes, 2) - probeOffset(t, probes, 0); got != 40000 {
		t.Fatalf("expected the first and last probe to be 40000ms apart, got %d", got)
	}
}

// --- completion handling on the disk-confirmed path ---

func TestADiskConfirmedSuccessCompletesTheEpisode(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	_, recorder, _ := recheckAttempt(t, folder, recheckCounters(folder, 4, 4), true, true)

	// Flattening alone would leave the file under the downloader's raw name, where the highest-
	// episode read resolves to 0 and the cursor survives on the file count alone -- so one
	// duplicate video makes the next run skip a real episode.
	if got := len(recorder.byEventType("download.renamed")); got != 1 {
		t.Fatalf("expected a disk-confirmed success to complete the episode exactly once, got %d download.renamed entries", got)
	}
}
