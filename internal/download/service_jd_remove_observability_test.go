package download

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download/jdownloader"
)

// jdAnswer is one scripted reply to PackageStatusByDestination.
type jdAnswer struct {
	status jdownloader.DestinationStatus
	err    error
}

// stagedJDClient answers PackageStatusByDestination from a scripted sequence, so one test can
// steer the PRE-CHECK query and the post-grace query independently. That separation is the only
// way to reach three of the four removal stages, which a single fixed status cannot distinguish.
type stagedJDClient struct {
	*svcFakeJDClient
	answers []jdAnswer

	mu      sync.Mutex
	calls   int
	removed []string
}

func (f *stagedJDClient) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	index := f.calls
	f.calls++
	if index >= len(f.answers) {
		return jdownloader.DestinationStatus{}, nil
	}
	return f.answers[index].status, f.answers[index].err
}

func (f *stagedJDClient) RemoveByDestination(_ context.Context, _, destination string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removed = append(f.removed, destination)
	return nil
}

func (f *stagedJDClient) RenameEpisodeByDestination(_ context.Context, _, _, baseName string) (string, error) {
	return baseName + ".mp4", nil
}

// removedDestinations returns the destinations RemoveByDestination was called for.
func (f *stagedJDClient) removedDestinations() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.removed...)
}

// aliveStatus is a matched destination with no dead signal and no positive signal: the pre-check
// reads it as "still downloading", so the attempt reaches the 60s grace.
var aliveStatus = jdownloader.DestinationStatus{Matched: true}

// deadStatus is a matched destination whose crawl reports every link offline.
var deadStatus = jdownloader.DestinationStatus{Matched: true, CrawlOfflineCount: 2}

// removalScenario runs one hoster attempt whose JD status is scripted, and returns the client and
// the captured log entries.
func removalScenario(t *testing.T, folder string, answers []jdAnswer) (*stagedJDClient, *fieldsRecorder) {
	t.Helper()
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	jd := &stagedJDClient{svcFakeJDClient: &svcFakeJDClient{}, answers: answers}
	s, recorder := newProbeWatchService(t, jd, counter, &now, func(string) bool { return false })
	s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, true)
	return jd, recorder
}

func TestEveryPackageRemovalPersistsOneWarnEntryWithItsOwnStage(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		answers   []jdAnswer
		wantStage string
	}{
		{
			name:      "pre-check classified the hoster dead",
			answers:   []jdAnswer{{status: deadStatus}},
			wantStage: "precheck_dead",
		},
		{
			name:      "post-grace status query failed on the first hoster",
			answers:   []jdAnswer{{status: aliveStatus}, {err: errors.New("jd unreachable")}},
			wantStage: "grace_query_error_first",
		},
		{
			name:      "post-grace status classified dead",
			answers:   []jdAnswer{{status: aliveStatus}, {status: deadStatus}},
			wantStage: "grace_classified_dead",
		},
		{
			name:      "post-grace produced no positive signal on the first hoster",
			answers:   []jdAnswer{{status: aliveStatus}, {status: aliveStatus}},
			wantStage: "grace_no_signal_first",
		},
	}

	seen := map[string]string{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertOneWarnRemoval(t, tc.answers, tc.wantStage)
			if previous, clash := seen[tc.wantStage]; clash {
				t.Fatalf("expected a distinct stage per removal site, but %q also fired for %q", tc.wantStage, previous)
			}
			seen[tc.wantStage] = tc.name
		})
	}
}

// assertOneWarnRemoval drives one removal scenario and pins the single ledger entry it must
// persist: exactly one removal, at warn level, carrying wantStage both in queryable metadata and
// in the message text. The message duplication is deliberate -- runtime_events metadata is not
// filterable, so a discriminator a reader must search on has to appear in the text too.
func assertOneWarnRemoval(t *testing.T, answers []jdAnswer, wantStage string) {
	t.Helper()

	jd, recorder := removalScenario(t, "folder-"+wantStage, answers)

	if got := jd.removedDestinations(); len(got) != 1 {
		t.Fatalf("expected exactly 1 package removal, got %v", got)
	}
	entry := recorder.only(t, "download.jd_removed")
	if entry.level != "warn" {
		t.Fatalf("expected a destructive removal to persist at warn level, got %q", entry.level)
	}
	if entry.metadata["stage"] != wantStage {
		t.Fatalf("expected stage %q, got %#v", wantStage, entry.metadata["stage"])
	}
	if !strings.Contains(entry.message, wantStage) {
		t.Fatalf("expected the message text to carry the queryable stage %q, got %q", wantStage, entry.message)
	}
}

func TestBlindRemovalRecordsThatNoStatusWasObserved(t *testing.T) {
	t.Parallel()

	_, recorder := removalScenario(t, "folder-blind-removal", []jdAnswer{
		{status: aliveStatus},
		{err: errors.New("jd unreachable")},
	})

	entry := recorder.only(t, "download.jd_removed")
	if entry.metadata["statusKnown"] != false {
		t.Fatalf("expected a removal with no observed status to record statusKnown=false, got %#v", entry.metadata["statusKnown"])
	}
	// A zero that was never measured and a zero that was measured lead to opposite conclusions,
	// so the status fields must be ABSENT rather than reported as observed zeroes.
	for _, key := range []string{"verdict", "crawlOnline", "crawlOffline", "links", "packages", "anyFinished", "anyRunning"} {
		if value, present := entry.metadata[key]; present {
			t.Fatalf("expected %q to be absent when nothing was measured, got %#v", key, value)
		}
	}
}

func TestRemovalOverFinishedWorkRecordsBothTheVerdictAndTheFinishedSignal(t *testing.T) {
	t.Parallel()

	folder := "folder-finished-work"
	deadOverFinishedWork := jdownloader.DestinationStatus{
		Matched:           true,
		CrawlOfflineCount: 3,
		Links:             []jdownloader.LinkSignal{{Finished: true}, {}},
		PackageSignals:    []jdownloader.PackageSignal{{Finished: true, FinishedObserved: true}},
	}

	_, recorder := removalScenario(t, folder, []jdAnswer{{status: deadOverFinishedWork}})

	entry := recorder.only(t, "download.jd_removed")
	if entry.metadata["verdict"] != "dead" {
		t.Fatalf("expected the justifying verdict to be recorded as dead, got %#v", entry.metadata["verdict"])
	}
	if entry.metadata["anyFinished"] != true {
		t.Fatalf("expected destroying finished work to be recoverable from anyFinished, got %#v", entry.metadata["anyFinished"])
	}
	if entry.metadata["anyRunning"] != false {
		t.Fatalf("expected anyRunning=false for a status with no running link, got %#v", entry.metadata["anyRunning"])
	}
	if entry.metadata["links"] != 2 || entry.metadata["packages"] != 1 {
		t.Fatalf("expected aggregate counts of 2 links and 1 package, got links=%#v packages=%#v", entry.metadata["links"], entry.metadata["packages"])
	}
	if entry.metadata["crawlOffline"] != 3 || entry.metadata["crawlOnline"] != 0 {
		t.Fatalf("expected the measured crawl counts, got offline=%#v online=%#v", entry.metadata["crawlOffline"], entry.metadata["crawlOnline"])
	}
	for key, value := range entry.metadata {
		if text, isText := value.(string); isText && strings.Contains(text, folder) {
			t.Fatalf("expected the removal entry to claim no destination path, but %q carried %q", key, text)
		}
		if _, isLinkSlice := value.([]jdownloader.LinkSignal); isLinkSlice {
			t.Fatalf("expected link identity never to be serialized, but %q carried the array", key)
		}
		if _, isPackageSlice := value.([]jdownloader.PackageSignal); isPackageSlice {
			t.Fatalf("expected package identity never to be serialized, but %q carried the array", key)
		}
	}
}

func TestAPathologicalStatusSnapshotCannotBlowThePersistenceBound(t *testing.T) {
	t.Parallel()

	pathological := jdownloader.DestinationStatus{Matched: true, CrawlOfflineCount: 4096}
	for range 5000 {
		pathological.Links = append(pathological.Links, jdownloader.LinkSignal{StatusIconKey: "error_file_not_found"})
	}
	for range 800 {
		pathological.PackageSignals = append(pathological.PackageSignals, jdownloader.PackageSignal{StatusIconKey: "error_file_not_found"})
	}

	_, recorder := removalScenario(t, "folder-pathological-status", []jdAnswer{{status: pathological}})

	// The bound is checked FIRST so that this assertion is demonstrably the one that fires when
	// the arrays are serialized instead of counted, rather than sitting behind a cheaper check.
	assertMetadataUnderBound(t, recorder)
	entry := recorder.only(t, "download.jd_removed")
	if entry.metadata["links"] != 5000 || entry.metadata["packages"] != 800 {
		t.Fatalf("expected the arrays to contribute aggregate counts, got links=%#v packages=%#v", entry.metadata["links"], entry.metadata["packages"])
	}
}

func TestTheRemovalRecordReportsOnlyObservedWorkSignals(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		status       jdownloader.DestinationStatus
		wantFinished bool
		wantRunning  bool
	}{
		{
			name:         "a finished link is finished work",
			status:       jdownloader.DestinationStatus{Links: []jdownloader.LinkSignal{{Finished: true}}},
			wantFinished: true,
		},
		{
			name:        "a running link is running work",
			status:      jdownloader.DestinationStatus{Links: []jdownloader.LinkSignal{{Running: true}}},
			wantRunning: true,
		},
		{
			name:         "work finished inside a package counts even with no link signal",
			status:       jdownloader.DestinationStatus{PackageSignals: []jdownloader.PackageSignal{{Finished: true, FinishedObserved: true}}},
			wantFinished: true,
		},
		{
			name:        "work running inside a package counts even with no link signal",
			status:      jdownloader.DestinationStatus{PackageSignals: []jdownloader.PackageSignal{{Running: true, RunningObserved: true}}},
			wantRunning: true,
		},
		{
			name:   "an UNOBSERVED package finished flag is not finished work",
			status: jdownloader.DestinationStatus{PackageSignals: []jdownloader.PackageSignal{{Finished: true}}},
		},
		{
			name:   "an UNOBSERVED package running flag is not running work",
			status: jdownloader.DestinationStatus{PackageSignals: []jdownloader.PackageSignal{{Running: true}}},
		},
		{
			name:   "a package OBSERVED as not finished is not finished work",
			status: jdownloader.DestinationStatus{PackageSignals: []jdownloader.PackageSignal{{FinishedObserved: true}}},
		},
		{
			name:   "a package OBSERVED as not running is not running work",
			status: jdownloader.DestinationStatus{PackageSignals: []jdownloader.PackageSignal{{RunningObserved: true}}},
		},
		{
			name:   "a status with no signals reports neither",
			status: jdownloader.DestinationStatus{Matched: true},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			metadata := jdRemovedMetadata("Mediafire", exitGraceClassifiedDead, &tc.status)

			if metadata["anyFinished"] != tc.wantFinished {
				t.Fatalf("expected anyFinished=%v, got %#v", tc.wantFinished, metadata["anyFinished"])
			}
			if metadata["anyRunning"] != tc.wantRunning {
				t.Fatalf("expected anyRunning=%v, got %#v", tc.wantRunning, metadata["anyRunning"])
			}
		})
	}
}
