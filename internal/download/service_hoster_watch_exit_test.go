package download

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/download/jdownloader"
)

// assertOutcome fails unless the attempt terminated with the expected kind AND the expected exit.
// The exit is compared against a LITERAL: asserting against the exitReason constant would let a
// renamed or retyped constant drag the assertion along with it and prove nothing about the value
// that actually reaches persisted metadata.
func assertOutcome(t *testing.T, outcome hosterOutcome, wantKind hosterOutcomeKind, wantExit string) {
	t.Helper()
	if outcome.kind != wantKind {
		t.Fatalf("expected outcome kind %v, got %v (exit %q)", wantKind, outcome.kind, string(outcome.exit))
	}
	if string(outcome.exit) != wantExit {
		t.Fatalf("expected the attempt to record exit %q, got %q", wantExit, string(outcome.exit))
	}
}

// pollTermination selects how the run behaves while the completion poll watches the disk.
type pollTermination int

const (
	// pollRunsToDeadline exhausts the poll's safety cap with the run still alive.
	pollRunsToDeadline pollTermination = iota
	// pollStoppedNothingLands stops the run before the first poll iteration and never lets the
	// episode land, so only the safety cap can end the attempt.
	pollStoppedNothingLands
	// pollStoppedThenLands stops the run before the first poll iteration and lands the episode on
	// the first sleep, the file JD keeps delivering after the user pressed Stop.
	pollStoppedThenLands
)

// completionPoll is what one completion-poll attempt ended on, plus the context the rename saw.
type completionPoll struct {
	outcome hosterOutcome
	// renameCtxErr is the rename's context error, nil when the rename ran on a live context.
	renameCtxErr error
	renamed      bool
}

// completionPollExit runs one hoster attempt that reaches the completion poll and returns what it
// terminated on.
//
// Every simulated poll interval jumps the clock a full day, so the deadline is crossed on the
// second iteration instead of after the 360 real ticks the 30-minute cap would otherwise need. A
// jump that large also cannot silently stop crossing the deadline if the cap is ever widened: the
// test would fail loudly on the label rather than pass while measuring nothing.
func completionPollExit(t *testing.T, termination pollTermination) completionPoll {
	t.Helper()
	folder := "folder-" + t.Name()
	now := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if termination != pollRunsToDeadline {
		cancel()
	}
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, landing: map[string]int{folder: 4}}
	deps := baseDeps(t)
	setSvcFakeCounter(&deps, counter)
	deps.Clock = func() time.Time { return now }
	sleeps := 0
	deps.PollSleep = func(time.Duration) {
		sleeps++
		if termination == pollStoppedThenLands && sleeps == 1 {
			counter.mu.Lock()
			counter.atRoot[folder]++
			counter.mu.Unlock()
			return
		}
		now = now.Add(24 * time.Hour)
	}
	var got completionPoll
	// Returning false stops before the JD rename call: the context it was handed is the evidence.
	deps.RenameEpisodes = func(c context.Context) bool {
		got.renamed, got.renameCtxErr = true, c.Err()
		return false
	}
	got.outcome = NewService(deps).awaitHosterOutcome(ctx, "run-1", testAnime(folder), "Mediafire", 4, 12, true)
	return got
}

func TestAStoppedRunStillFollowsTheDownloadJDAlreadyAccepted(t *testing.T) {
	t.Parallel()

	// Once JD accepted the enqueue it keeps downloading whatever Bridge stops watching, so Stop
	// never ends the completion poll: the attempt ends only on the episode or the safety cap.
	t.Run("deadline reached with the run still alive", func(t *testing.T) {
		t.Parallel()

		assertOutcome(t, completionPollExit(t, pollRunsToDeadline).outcome, hosterOutcomeTimeout, "fs_poll_deadline")
	})

	t.Run("a stopped run keeps polling until the cap", func(t *testing.T) {
		t.Parallel()

		assertOutcome(t, completionPollExit(t, pollStoppedNothingLands).outcome, hosterOutcomeTimeout, "fs_poll_deadline")
	})

	t.Run("a stopped run still renames the episode JD delivers", func(t *testing.T) {
		t.Parallel()

		got := completionPollExit(t, pollStoppedThenLands)
		assertOutcome(t, got.outcome, hosterOutcomeSuccess, "fs_poll_confirmed")
		if !got.renamed || got.renameCtxErr != nil {
			t.Fatalf("expected the rename to run on a live context, got renamed=%v err=%v", got.renamed, got.renameCtxErr)
		}
	})
}

// postGraceDeadEnd runs one hoster attempt whose grace expires over a status that is neither dead
// nor positively alive -- the one condition a first hoster and a fallback reach through the same
// return, so nothing but their position in the chain separates them.
func postGraceDeadEnd(t *testing.T, isFirstHoster bool) hosterOutcome {
	t.Helper()
	folder := "folder-" + t.Name()
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, landing: map[string]int{folder: 4}}
	jd := &stagedJDClient{svcFakeJDClient: &svcFakeJDClient{}, answers: []jdAnswer{
		{status: aliveStatus},
		{status: aliveStatus},
	}}
	s, _ := newProbeWatchService(t, jd, counter, &now, func(string) bool { return false })
	return s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, isFirstHoster)
}

func TestAFallbackDeadEndIsRecordedApartFromItsFirstHosterTwin(t *testing.T) {
	t.Parallel()

	first := postGraceDeadEnd(t, true)
	fallback := postGraceDeadEnd(t, false)

	assertOutcome(t, first, hosterOutcomeDead, "grace_no_signal_first")
	assertOutcome(t, fallback, hosterOutcomeTimeout, "grace_no_signal_fallback")
	if first.exit == fallback.exit {
		t.Fatalf("expected chain position to separate the same dead end, got %q for both", string(first.exit))
	}
}

// diskAdvancingJDClient moves the on-disk count during the pre-check query, so the attempt clears
// the entry guard on the OLD count and the completion poll is left to observe the advance itself.
// Without that ordering every disk success would be an entry-guard success and the two exits this
// test separates could never both occur.
type diskAdvancingJDClient struct {
	*svcFakeJDClient
	advance func()
}

// PackageStatusByDestination advances the disk count and answers with a running transfer, which
// the classifier reads as alive so the attempt is never declared dead before the poll runs.
func (f *diskAdvancingJDClient) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	f.advance()
	return jdownloader.DestinationStatus{Matched: true, Links: []jdownloader.LinkSignal{{Running: true}}}, nil
}

// successExit runs one hoster attempt against a baseline of 4 with renaming enabled, returning the
// outcome and the JD fake that recorded the renames. startAtRoot is what the attempt finds at
// entry; advanceDuringPreCheck instead moves the count to 5 after the entry guard has run.
func successExit(t *testing.T, startAtRoot int, advanceDuringPreCheck bool) (hosterOutcome, *svcFakeJDClient) {
	t.Helper()
	folder := "folder-" + t.Name()
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: startAtRoot}, landing: map[string]int{folder: startAtRoot}}
	inner := &svcFakeJDClient{}
	deps := baseDeps(t)
	deps.JD = inner
	if advanceDuringPreCheck {
		deps.JD = &diskAdvancingJDClient{svcFakeJDClient: inner, advance: func() {
			counter.mu.Lock()
			defer counter.mu.Unlock()
			counter.atRoot[folder] = 5
		}}
	}
	deps.RenameEpisodes = func(context.Context) bool { return true }
	setSvcFakeCounter(&deps, counter)
	deps.Clock = func() time.Time { return now }
	deps.PollSleep = func(d time.Duration) { now = now.Add(d) }
	outcome := NewService(deps).awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, true)
	return outcome, inner
}

func TestAnObservedSuccessIsDistinguishableFromOneAlreadyOnDisk(t *testing.T) {
	t.Parallel()

	// This is the discriminator the whole change exists for. Both cases report success and both
	// are credited to the same hoster; only the exit says WHERE the success was observed -- found
	// already on disk when the attempt began, or watched arriving by the poll. Completion handling
	// no longer rides on that distinction: every success path renames, because the rename is what
	// the NEXT episode's baseline count reads.
	t.Run("already on disk when the attempt began", func(t *testing.T) {
		t.Parallel()

		outcome, jd := successExit(t, 5, false)

		assertOutcome(t, outcome, hosterOutcomeSuccess, "disk_ahead_at_entry")
		if got := len(jd.recordedRenames()); got != 1 {
			t.Fatalf("expected an entry-guard success to complete the episode exactly once, got %d renames", got)
		}
	})

	t.Run("observed by the completion poll", func(t *testing.T) {
		t.Parallel()

		outcome, jd := successExit(t, 4, true)

		assertOutcome(t, outcome, hosterOutcomeSuccess, "fs_poll_confirmed")
		if got := len(jd.recordedRenames()); got != 1 {
			t.Fatalf("expected a poll-confirmed success to rename the episode exactly once, got %d renames", got)
		}
	})
}

// postGraceProceed runs an attempt whose post-grace status carries a positive signal, so the grace
// evaluation returns NIL and the attempt continues into the completion poll.
func postGraceProceed(t *testing.T) hosterOutcome {
	t.Helper()
	folder := "folder-" + t.Name()
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, landing: map[string]int{folder: 4}}
	jd := &stagedJDClient{svcFakeJDClient: &svcFakeJDClient{}, answers: []jdAnswer{
		{status: aliveStatus},
		{status: jdownloader.DestinationStatus{Matched: true, Links: []jdownloader.LinkSignal{{Running: true}}}},
	}}
	s, _ := newProbeWatchService(t, jd, counter, &now, func(string) bool { return false })
	return s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, true)
}

func TestTheProceedAndContinuePathTakesItsExitFromTheEventualTerminalPoint(t *testing.T) {
	t.Parallel()

	outcome := postGraceProceed(t)

	// On the proceed path no outcome struct exists at all, so there is nothing there to stamp.
	// The recorded value belongs to the completion poll, reached long after the grace evaluation
	// returned -- any grace-stage value here would mean the sentinel came back.
	assertOutcome(t, outcome, hosterOutcomeTimeout, "fs_poll_deadline")
}
