package download

import (
	"context"
	"testing"
	"time"
)

// recheckCounters builds the root episode count one grace-watched attempt starts from.
func recheckCounters(folder string, atRoot int) *svcFakeCounter {
	return &svcFakeCounter{atRoot: map[string]int{folder: atRoot}}
}

// recheckAttempt runs one hoster attempt whose detect phase never sees a .part file and whose
// JD answers are inconclusive at both queries, against a baseline of 4.
//
// landDuringGrace adds one episode at the folder ROOT right after the third probe, so the fourth
// probe's count check is the only reading that sees it: JD finished the file between two probes
// without a .part ever showing.
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
			counter.atRoot[folder]++
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
// closes the loop. Both together are what fail when the count check moves after the JD evaluation.
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

// --- the grace's episode count check ---

func TestAFileThatLandsBetweenProbesProducesADiskConfirmedSuccess(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4), true, true)

	// No probe ever saw a .part file, so only the count check can see the episode.
	assertOutcome(t, outcome, hosterOutcomeSuccess, "grace_disk_confirmed")
	assertNoPackageRemoval(t, recorder, jd)
}

func TestAnEpisodeThatLandsBeforeTheFirstProbeIsConfirmedOnThatProbe(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()
	counter := recheckCounters(folder, 4)
	now := time.Now()
	jd := &stagedJDClient{svcFakeJDClient: &svcFakeJDClient{}, answers: []jdAnswer{{status: aliveStatus}, {status: aliveStatus}}}
	s, recorder := newProbeWatchService(t, jd, counter, &now, func(string) bool { return false })
	s.deps.RenameEpisodes = func(context.Context) bool { return true }
	// The episode lands during the first 5s sleep, after the entry guard read the baseline, so the
	// very first probe is the one that must see it.
	sleep, landed := s.deps.PollSleep, false
	s.deps.PollSleep = func(d time.Duration) {
		sleep(d)
		if !landed {
			landed = true
			counter.mu.Lock()
			counter.atRoot[folder]++
			counter.mu.Unlock()
		}
	}

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, true)

	assertOutcome(t, outcome, hosterOutcomeSuccess, "grace_disk_confirmed")
	assertNoPackageRemoval(t, recorder, jd)
	if probes := metadataProbes(t, recorder.only(t, "download.detect_start_succeeded")); len(probes) != 1 {
		t.Fatalf("expected the grace to end on the first probe, got %#v", probes)
	}
}

func TestAnAttemptWhereNothingLandsFallsThroughUnchanged(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4), false, true)

	// Equality is not a landing. The comparison is strictly greater-than, so an unchanged count
	// must leave every downstream decision exactly where it stood, the removal included.
	assertFellThroughToRemoval(t, outcome, recorder, jd)
}

func TestADiskConfirmedSuccessIsIndependentOfChainPosition(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	// The three post-grace dead-end pairs split first-hoster from fallback because their KIND
	// differs by position. A success does not: a file that landed is a file that landed, so the
	// fallback attempt reports the same exit rather than the timeout its dead-end twin would.
	outcome, recorder, jd := recheckAttempt(t, folder, recheckCounters(folder, 4), true, false)

	assertOutcome(t, outcome, hosterOutcomeSuccess, "grace_disk_confirmed")
	assertNoPackageRemoval(t, recorder, jd)
}

// --- the probe timeline of a disk-confirmed attempt ---

func TestADiskConfirmedAttemptPersistsItsProbeTimeline(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	_, recorder, _ := recheckAttempt(t, folder, recheckCounters(folder, 4), true, true)

	// The grace ends on the probe that saw the episode, and that probe says WHICH signal ended it:
	// landed, not a .part file. Without the flag a reader cannot tell this success from a transfer.
	entry := recorder.only(t, "download.detect_start_succeeded")
	if entry.level != "info" {
		t.Fatalf("expected the probe timeline to persist at info level, got %q", entry.level)
	}
	if got := len(recorder.byEventType("download.detect_start_failed")); got != 0 {
		t.Fatalf("expected no detect_start_failed entry on a disk-confirmed attempt, got %d", got)
	}
	probes := metadataProbes(t, entry)
	if len(probes) != 4 {
		t.Fatalf("expected the grace to stop at the fourth probe, got %#v", probes)
	}
	for i, p := range probes[:3] {
		if p["found"] != false || p["landed"] != false {
			t.Fatalf("expected the probes before the landing to see nothing, got probe %d: %#v", i, p)
		}
	}
	if probes[3]["landed"] != true || probes[3]["found"] != false {
		t.Fatalf("expected the last probe to report landed=true and found=false, got %#v", probes[3])
	}
}

func TestProbeOffsetsStillAdvanceOnTheDiskConfirmedPath(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	_, recorder, _ := recheckAttempt(t, folder, recheckCounters(folder, 4), true, true)

	// A fixed clock makes this guard's own tests pass while measuring nothing, and the offsets are
	// where that shows: under a frozen clock every probe records the same number.
	probes := metadataProbes(t, recorder.only(t, "download.detect_start_succeeded"))
	previous := int64(-1)
	for i := range probes {
		elapsed := probeOffset(t, probes, i)
		if elapsed <= previous {
			t.Fatalf("expected strictly increasing probe offsets under a moving clock, got %#v", probes)
		}
		previous = elapsed
	}
	if got := probeOffset(t, probes, 3) - probeOffset(t, probes, 0); got != 15000 {
		t.Fatalf("expected the first and last probe to be 15000ms apart, got %d", got)
	}
}

// --- completion handling on the disk-confirmed path ---

func TestADiskConfirmedSuccessCompletesTheEpisode(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()

	_, recorder, _ := recheckAttempt(t, folder, recheckCounters(folder, 4), true, true)

	// Without the rename the file keeps the downloader's raw name, where the highest-
	// episode read resolves to 0 and the cursor survives on the file count alone -- so one
	// duplicate video makes the next run skip a real episode.
	if got := len(recorder.byEventType("download.renamed")); got != 1 {
		t.Fatalf("expected a disk-confirmed success to complete the episode exactly once, got %d download.renamed entries", got)
	}
}
