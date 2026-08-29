package download

import (
	"context"
	"reflect"
	"strconv"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/download/sites"
)

// twoHosterChain is the Mediafire-then-Mega order the fallback fakes recognise from their URLs.
func twoHosterChain() []hosterLink {
	return []hosterLink{
		{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}},
		{hoster: "Mega", links: []string{"http://mega.example/1"}},
	}
}

// assertResultExit pins the exit an episode-level result recorded, written as a literal so the
// assertion cannot pass merely by agreeing with the constant it is pinning.
func assertResultExit(t *testing.T, result episodeEnqueueResult, wantExit string) {
	t.Helper()
	if string(result.exit) != wantExit {
		t.Fatalf("expected the episode to record exit %q, got %q", wantExit, string(result.exit))
	}
}

// assertNothingCredited pins the "no attempt ever ran" shape: no hoster at all, and an attempt
// index that cannot be misread as the first hoster in the priority order -- which is precisely the
// hoster that did NOT run. The -1 is a literal on purpose: comparing against noAttemptIndex would
// agree with whatever value that constant drifted to, which is how two mutants survived here.
func assertNothingCredited(t *testing.T, result episodeEnqueueResult) {
	t.Helper()
	if result.hoster != "" {
		t.Fatalf("expected no credited hoster when no attempt ever ran, got %q", result.hoster)
	}
	if result.attemptIndex != -1 {
		t.Fatalf("expected attemptIndex -1 when no attempt ever ran, got %d", result.attemptIndex)
	}
}

// assertCredited pins which hoster and attempt an episode result credits.
func assertCredited(t *testing.T, result episodeEnqueueResult, hoster string, attemptIndex int) {
	t.Helper()
	if result.hoster != hoster || result.attemptIndex != attemptIndex {
		t.Fatalf("expected the credited attempt to be %q at index %d, got %q at index %d",
			hoster, attemptIndex, result.hoster, result.attemptIndex)
	}
}

// chainResult runs one enqueueWithFallback over the supplied hoster order and returns its result.
// A nil jd is a genuinely absent downloader client, not a typed nil hiding inside the interface.
func chainResult(t *testing.T, jd jdownloader.JDClient, ordered []hosterLink) episodeEnqueueResult {
	t.Helper()
	folder := "folder-" + t.Name()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	deps.JD = jd
	return NewService(deps).enqueueWithFallback(context.Background(), "run-1", testAnime(folder), ordered, 12)
}

// cancelledChainResult stops the run while the FIRST hoster is being enqueued, so the loop reaches
// its mid-loop pre-attempt return on the next iteration instead of watching a second hoster.
func cancelledChainResult(t *testing.T) episodeEnqueueResult {
	t.Helper()
	folder := "folder-" + t.Name()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	deps.JD = &cancelOnFirstHosterJD{svcFakeJDClient: &svcFakeJDClient{}, cancel: cancel}
	return NewService(deps).enqueueWithFallback(ctx, "run-1", testAnime(folder), twoHosterChain(), 12)
}

func TestAPreAttemptExitIsDistinguishableFromAnExhaustedChain(t *testing.T) {
	t.Parallel()

	// The empty-order fall-through and the exhausted chain leave through the SAME return, and
	// today both report the same pre-initialised failure kind. Only the unset exit surviving can
	// tell "the link extractor produced nothing" from "every hoster failed".
	t.Run("no hosters resolved", func(t *testing.T) {
		t.Parallel()

		result := chainResult(t, &svcFakeJDClient{}, nil)

		assertResultExit(t, result, "no_hosters")
		assertNothingCredited(t, result)
	})

	t.Run("no downloader client at all", func(t *testing.T) {
		t.Parallel()

		result := chainResult(t, nil, twoHosterChain())

		assertResultExit(t, result, "jd_unavailable")
		assertNothingCredited(t, result)
	})

	t.Run("cancelled before the next attempt", func(t *testing.T) {
		t.Parallel()

		result := cancelledChainResult(t)

		assertResultExit(t, result, "cancelled_before_attempt")
		// An attempt DID run before the stop, so the credited attempt is that one -- the exit
		// says the NEXT attempt never started, which is a different statement.
		assertCredited(t, result, "Mediafire", 0)
	})

	t.Run("every hoster attempted and failed", func(t *testing.T) {
		t.Parallel()

		jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true, "Mega": true}}

		result := chainResult(t, jd, twoHosterChain())

		// The LAST attempt's own terminal value, never a synthetic "exhausted": the reader's
		// question is HOW the last attempt ended, and "exhausted" answers a different one.
		assertResultExit(t, result, "precheck_dead")
		assertCredited(t, result, "Mega", 1)
	})
}

// episodeRun drives ONE episode through the pipeline emit sites and returns the captured log with
// the anime outcome. download.episode_downloaded and the episode-level download.failed exist only
// at this level, so the episode-entry assertions cannot be made anywhere shallower.
func episodeRun(t *testing.T, deps ServiceDeps, folder string, current int) (*fieldsRecorder, animeRunOutcome) {
	t.Helper()
	sourceURL := "https://jkanime.net/anime/"
	source := &svcFakeEpisodeSource{name: "jkanime", extractLinks: map[string][]sites.DownloadLink{
		sourceURL + strconv.Itoa(current+1) + "/": {{Hoster: "Mediafire", URL: "http://mediafire.example/1"}},
	}}
	recorder := &fieldsRecorder{}
	deps.Logger = recorder
	anime := contracts.MobileAnime{ID: "anime-1", Name: "Test Anime", Folder: &folder, SourceURL: &sourceURL}
	outcome := animeRunOutcome{}
	_, _ = NewService(deps).processAvailableEpisode(context.Background(), "run-1", anime,
		fixedJDGate(true), source, current, &outcome, func(animeProgressDelta) {})
	return recorder, outcome
}

// episodeLevelFailure returns the single episode-level download.failed entry. The per-hoster
// failure-taxonomy rows share that event type but stay at warn, so the level is what separates the
// episode's own verdict from the attempts that led to it.
func episodeLevelFailure(t *testing.T, recorder *fieldsRecorder) recordedEntry {
	t.Helper()
	var out []recordedEntry
	for _, entry := range recorder.byEventType("download.failed") {
		if entry.level == "error" {
			out = append(out, entry)
		}
	}
	if len(out) != 1 {
		t.Fatalf("expected exactly 1 episode-level download.failed entry, got %d", len(out))
	}
	return out[0]
}

// assertEpisodeForensics pins the five discriminators an episode-level entry must carry. Every
// expectation is a literal: an assertion written against the exitReason constants would follow a
// rename and stop proving anything about what a reader actually finds in the persisted row.
func assertEpisodeForensics(t *testing.T, entry recordedEntry, exit, hoster string, attemptIndex, baseline, observed int) {
	t.Helper()
	want := map[string]any{
		"exit": exit, "hoster": hoster, "attemptIndex": attemptIndex,
		"baseline": baseline, "observed": observed,
	}
	for key, value := range want {
		if entry.metadata[key] != value {
			t.Fatalf("expected %s metadata %s=%v, got %#v", entry.eventType, key, value, entry.metadata[key])
		}
	}
}

// diskSuccessDeps wires an episode whose bytes land during the enqueue itself, so the attempt finds
// the disk already ahead of the baseline the moment it starts watching.
func diskSuccessDeps(t *testing.T, folder string) ServiceDeps {
	t.Helper()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	deps.JD = &diskSuccessOnFirstAddAndStart{svcFakeJDClient: &svcFakeJDClient{}, counter: counter, folder: folder}
	return deps
}

func TestTheEpisodeEntriesCarryTheAttemptThatProducedThem(t *testing.T) {
	t.Parallel()

	t.Run("success", func(t *testing.T) {
		t.Parallel()

		folder := "folder-" + t.Name()

		recorder, _ := episodeRun(t, diskSuccessDeps(t, folder), folder, 4)

		assertEpisodeForensics(t, recorder.only(t, "download.episode_downloaded"), "disk_ahead_at_entry", "Mediafire", 0, 4, 5)
	})

	t.Run("failure keeps its existing classification", func(t *testing.T) {
		t.Parallel()

		folder := "folder-" + t.Name()
		counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
		deps, _ := fastEnqueueDeps(t, folder, counter)
		deps.JD = &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true}}

		recorder, _ := episodeRun(t, deps, folder, 4)

		entry := episodeLevelFailure(t, recorder)
		assertEpisodeForensics(t, entry, "precheck_dead", "Mediafire", 0, 4, 4)
		if entry.metadata["failureKind"] != "hoster_down" {
			t.Fatalf("expected the episode failure to keep failureKind hoster_down, got %#v", entry.metadata["failureKind"])
		}
	})
}

func TestNoPersistedExitIsEverTheUnsetValue(t *testing.T) {
	t.Parallel()

	folder := "folder-" + t.Name()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	deps.JD = &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true}}

	recorder, _ := episodeRun(t, deps, folder, 4)

	for _, entry := range recorder.byEventType("download.hoster_attempt") {
		if _, ok := entry.metadata["exit"]; !ok {
			t.Fatalf("expected every ledger row to name its terminal point, got %#v", entry.metadata)
		}
	}
	assertEveryRecordedExitIsStamped(t, recorder)
}

// assertEveryRecordedExitIsStamped fails when any persisted entry carries an empty exit. The unset
// value means "no terminal point was ever stamped"; it exists to be READ exactly once inside
// enqueueWithFallback and must never reach a row a human reads.
func assertEveryRecordedExitIsStamped(t *testing.T, recorder *fieldsRecorder) {
	t.Helper()
	stamped := 0
	for _, entry := range recorder.all() {
		raw, ok := entry.metadata["exit"]
		if !ok {
			continue
		}
		stamped++
		if raw == "" {
			t.Fatalf("expected %s to carry a stamped exit, got the unset value", entry.eventType)
		}
	}
	if stamped == 0 {
		t.Fatal("expected the scenario to record at least one exit to check")
	}
}

// deadWhileDiskAdvancesJDClient replays run-dl1532pqkk3g: the post-grace query classifies the
// hoster dead at the very moment the transfer has already put a file on disk. The pre-check answers
// alive so the attempt reaches the grace at all, and only the SECOND answer is dead -- an advance
// visible any earlier would be caught by the entry guard and never reach the classifier.
type deadWhileDiskAdvancesJDClient struct {
	*svcFakeJDClient
	advance func()

	mu      sync.Mutex
	calls   int
	removed []string
}

// PackageStatusByDestination answers alive first, then advances the disk count and answers dead.
func (f *deadWhileDiskAdvancesJDClient) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	f.mu.Lock()
	f.calls++
	first := f.calls == 1
	f.mu.Unlock()
	if first {
		return jdownloader.DestinationStatus{Matched: true}, nil
	}
	f.advance()
	return jdownloader.DestinationStatus{Matched: true, CrawlOfflineCount: 2}, nil
}

// RemoveByDestination records the destructive removal this scenario must still perform.
func (f *deadWhileDiskAdvancesJDClient) RemoveByDestination(_ context.Context, _, destination string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removed = append(f.removed, destination)
	return nil
}

// removals returns how many package removals the client was asked to perform.
func (f *deadWhileDiskAdvancesJDClient) removals() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.removed)
}

// deadOverAdvancedDiskEpisode runs one episode whose only hoster is classified dead after the grace
// while the disk count has already moved from 4 to observedAtTerminal. It returns the persisted
// episode failure, the anime outcome, and the JD fake that recorded the removal.
func deadOverAdvancedDiskEpisode(t *testing.T, label string, observedAtTerminal int) (recordedEntry, animeRunOutcome, *deadWhileDiskAdvancesJDClient) {
	t.Helper()
	folder := "folder-" + t.Name() + "-" + label
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	deps.DetectStartPhaseDisabled = false
	deps.HasPartFiles = func(string) bool { return false }
	jd := &deadWhileDiskAdvancesJDClient{svcFakeJDClient: &svcFakeJDClient{}, advance: func() {
		counter.mu.Lock()
		defer counter.mu.Unlock()
		counter.atRoot[folder] = observedAtTerminal
	}}
	deps.JD = jd

	recorder, outcome := episodeRun(t, deps, folder, 4)

	return episodeLevelFailure(t, recorder), outcome, jd
}

func TestADeadVerdictOverAnAdvancedDiskCountIsRecordedAndNotCorrected(t *testing.T) {
	t.Parallel()

	entry, outcome, jd := deadOverAdvancedDiskEpisode(t, "replay", 5)

	// The whole point: the evidence is written down and NOTHING acts on it. An implementation
	// that consulted the observed count here would rescue the episode, and the defect this change
	// exists to size would disappear before anyone measured it.
	if !outcome.failed || outcome.episodesFailed != 1 {
		t.Fatalf("expected the episode to still fail over the advanced disk count, got %#v", outcome)
	}
	if jd.removals() != 1 {
		t.Fatalf("expected the destructive removal to still happen, got %d removals", jd.removals())
	}
	assertEpisodeForensics(t, entry, "grace_classified_dead", "Mediafire", 0, 4, 5)
}

// assertSameRunCounters fails unless two anime outcomes agree on every verdict and counter.
func assertSameRunCounters(t *testing.T, a, b animeRunOutcome) {
	t.Helper()
	if a.failed != b.failed || a.failureKind != b.failureKind {
		t.Fatalf("expected the same verdict, got %v/%q and %v/%q", a.failed, a.failureKind, b.failed, b.failureKind)
	}
	if a.episodesFailed != b.episodesFailed || a.episodesDownloaded != b.episodesDownloaded {
		t.Fatalf("expected the same run counters, got %d/%d and %d/%d",
			a.episodesFailed, a.episodesDownloaded, b.episodesFailed, b.episodesDownloaded)
	}
}

// assertSameExceptObserved fails unless two persisted episode failures agree on every recorded
// field except observed. The moment any branch reads the observed count, one of these moves too.
func assertSameExceptObserved(t *testing.T, a, b recordedEntry) {
	t.Helper()
	if a.level != b.level || len(a.metadata) != len(b.metadata) {
		t.Fatalf("expected identical shape, got %q %#v and %q %#v", a.level, a.metadata, b.level, b.metadata)
	}
	for key := range a.metadata {
		if key == "observed" {
			continue
		}
		if a.metadata[key] != b.metadata[key] {
			t.Fatalf("expected %s to be identical across the pair, got %#v and %#v", key, a.metadata[key], b.metadata[key])
		}
	}
}

func TestTwoAttemptsDifferingOnlyInTheObservedCountBehaveIdentically(t *testing.T) {
	t.Parallel()

	low, lowOutcome, _ := deadOverAdvancedDiskEpisode(t, "low", 5)
	high, highOutcome, _ := deadOverAdvancedDiskEpisode(t, "high", 9)

	assertSameRunCounters(t, lowOutcome, highOutcome)
	assertSameExceptObserved(t, low, high)
	if low.metadata["observed"] != 5 || high.metadata["observed"] != 9 {
		t.Fatalf("expected the pair to record observed 5 and 9, got %#v and %#v", low.metadata["observed"], high.metadata["observed"])
	}
}

// forbiddenOutcomeFields is the forensic VOCABULARY this change introduces. The guard pins the
// vocabulary rather than the field list on purpose: pinning the list would fail the moment the
// notification work legitimately adds a field, and a guard that cries wolf gets deleted.
var forbiddenOutcomeFields = map[string]bool{
	"exit": true, "hoster": true, "attemptIndex": true,
	"baseline": true, "observed": true, "winningHoster": true,
}

func TestTheAnimeRunOutcomeNeverGrowsAForensicField(t *testing.T) {
	t.Parallel()

	outcomeType := reflect.TypeOf(animeRunOutcome{})
	for i := range outcomeType.NumField() {
		name := outcomeType.Field(i).Name
		if forbiddenOutcomeFields[name] {
			t.Fatalf("animeRunOutcome must not carry the forensic field %q: animeProgressDelta is a type ALIAS of it, "+
				"so the field is now inside every live progress payload the UI renders. Assemble it at the emit site "+
				"and discard it there instead of widening this struct.", name)
		}
	}
	if reflect.TypeOf(animeRunOutcome{}) != reflect.TypeOf(animeProgressDelta{}) {
		t.Fatal("animeProgressDelta is no longer a type ALIAS of animeRunOutcome. The alias is exactly why the field " +
			"guard above is load-bearing; turning it into a defined type silently voids half of this test.")
	}
}
