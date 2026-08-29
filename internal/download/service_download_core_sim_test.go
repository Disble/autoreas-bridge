package download

// This file is the harness for the download-core integration battery in
// service_download_core_integration_test.go. It exists because the package's default test
// wiring cannot reach the code that battery covers: baseDeps sets DetectStartPhaseDisabled,
// a FIXED Clock and a no-op PollSleep, and setSvcFakeCounter replaces the episode counter
// AND the flattener -- so a t.TempDir() handed to those tests is only a path string, and
// roughly seventy full-run invocations never enter the detect phase at all.
//
// jdSim closes that gap. The virtual clock IS the scheduler: PollSleep advances a shared
// *time.Time and drains a scripted timeline that performs REAL os.WriteFile / os.Rename
// calls inside a t.TempDir(). The suite is single-goroutine by construction, so "JD writes
// the file between probe 2 and probe 3" is lexical ordering inside one PollSleep call, not
// a timing window -- nothing here needs a mutex, a channel or an Eventually.
//
// "Keep real-adapter coverage" is not a property any spec requirement can enforce
// deterministically, so this comment and one learning-log line ARE its durable record.
// Every new symbol is prefixed jdSim/sim/coreIntegration and never svcFake, so it can never
// be mistaken for the fake wiring it deliberately refuses.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
)

// simMinFixtureNameLength is the shortest fixture base name the production .part sensor can
// see: hasPartFilesRecursive slices the LAST FIVE BYTES of a file name, so a file named
// exactly ".part" is invisible to it (service_hoster_watch.go:96). A scenario that tripped
// this silently would run green while exercising nothing, which is why it is enforced.
const simMinFixtureNameLength = 5

// coreIntegrationMaxEnqueues bounds how many AddAndStart calls one scenario may make before
// the runaway guard fires. downloadAvailableEpisodes loops while the disk-derived cursor is
// below the latest episode, so a mutant that stalls that cursor produces an INFINITE LOOP
// rather than a failure.
const coreIntegrationMaxEnqueues = 4

// jdAction is one scripted JD side effect, fired when the virtual clock first reaches
// armedAt+at. Offsets are absolute from the FIRST AddAndStart, so one script spans an entire
// episode sequence rather than a single attempt.
type jdAction struct {
	at time.Duration
	do func(*jdSim)
}

// jdSim is a JDownloader stand-in that performs REAL file operations on a REAL folder,
// scheduled against the virtual clock the suite advances through PollSleep. It is the only
// fake left in this battery -- the counter, the flattener and the .part sensor are the
// production adapters.
type jdSim struct {
	*svcFakeJDClient // Connect/ListDevices/EnsureOnline/Disconnect, unchanged

	t      *testing.T
	folder string
	// now is the same *time.Time the service's Clock and PollSleep read, so the script's
	// anchor is taken from the clock the core itself observes rather than a second one.
	now    *time.Time
	cancel context.CancelFunc

	armed   bool
	armedAt time.Time
	script  []jdAction
	cursor  int

	status      jdownloader.DestinationStatus // what both JD queries answer
	finished    string                        // absolute path JD believes it holds; "" = nothing
	enqueued    []string                      // one hoster per AddAndStart, in order
	removals    int
	maxEnqueues int
}

// newJDSim builds a simulator over a fixture root, scripted with an absolute timeline.
func newJDSim(t *testing.T, folder string, now *time.Time, script ...jdAction) *jdSim {
	t.Helper()
	return &jdSim{
		svcFakeJDClient: &svcFakeJDClient{},
		t:               t,
		folder:          folder,
		now:             now,
		script:          script,
		maxEnqueues:     coreIntegrationMaxEnqueues,
	}
}

// advanceTo fires every scheduled action whose instant the clock has reached, in order.
// It runs INSIDE PollSleep, so an action lands lexically between the probe that preceded the
// sleep and the probe that follows it -- single-goroutine by construction.
func (sim *jdSim) advanceTo(now time.Time) {
	if !sim.armed {
		return
	}
	for sim.cursor < len(sim.script) && !now.Before(sim.armedAt.Add(sim.script[sim.cursor].at)) {
		action := sim.script[sim.cursor]
		sim.cursor++
		action.do(sim)
	}
}

// AddAndStart records which hoster was enqueued and arms the script ONCE, on the first call.
// Later enqueues deliberately do NOT re-arm: the script is one absolute timeline for the whole
// episode sequence, and re-arming would replay the previous episode's actions.
func (sim *jdSim) AddAndStart(_ context.Context, _ string, req jdownloader.EnqueueRequest) error {
	sim.enqueued = append(sim.enqueued, inferHosterFromURLs(req.URLs))
	if !sim.armed {
		sim.armed = true
		sim.armedAt = *sim.now
	}
	sim.enforceEnqueueBudget()
	return nil
}

// enforceEnqueueBudget turns a stalled download cursor into an ordinary assertion failure.
// Cancelling the scenario's context is what unwinds the production loop: ctx.Err() is checked
// at the top of downloadAvailableEpisodes, so the run ends normally instead of hanging until
// the package-level test timeout.
func (sim *jdSim) enforceEnqueueBudget() {
	if sim.maxEnqueues <= 0 || len(sim.enqueued) <= sim.maxEnqueues {
		return
	}
	sim.t.Errorf("sim: %d AddAndStart calls exceeded the runaway budget of %d, so the disk-derived cursor is not advancing",
		len(sim.enqueued), sim.maxEnqueues)
	if sim.cancel != nil {
		sim.cancel()
	}
}

// PackageStatusByDestination answers both JD queries from the scripted status.
func (sim *jdSim) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	return sim.status, nil
}

// RemoveByDestination drops JD's own package records and TOUCHES NO FILE, verified against
// jdownloader/status.go, which makes no os. call at all. That is exactly why the incident's
// first attempt still found the episode sitting at the folder root afterwards.
func (sim *jdSim) RemoveByDestination(context.Context, string, string) error {
	sim.removals++
	sim.finished = ""
	return nil
}

// RenameEpisodeByDestination renames the ONE path JD still believes it holds, in place, and
// nothing else. It deliberately never re-scans the folder: rename.go resolves the newest
// FINISHED LINK and returns ErrNoRenamableLink when JD holds none, so a re-scanning fake would
// silently succeed after a flatten and make the rename-before-flatten order rule untestable.
func (sim *jdSim) RenameEpisodeByDestination(_ context.Context, _, _, baseName string) (string, error) {
	if sim.finished == "" {
		return "", jdownloader.ErrNoRenamableLink
	}
	if _, err := os.Stat(sim.finished); err != nil {
		return "", jdownloader.ErrNoRenamableLink
	}
	renamed := baseName + filepath.Ext(sim.finished)
	target := filepath.Join(filepath.Dir(sim.finished), renamed)
	if err := os.Rename(sim.finished, target); err != nil {
		return "", err
	}
	sim.finished = target
	return renamed, nil
}

// fixturePath resolves a scripted path INSIDE the fixture root; relDir "" means the root.
// Every path the sim touches goes through here and none may escape sim.folder. A harness bug
// that wrote into the repository is the one genuinely damaging failure mode of a battery that
// performs real file operations, and the single-root rule is what forecloses it.
func (sim *jdSim) fixturePath(relDir, name string) string {
	sim.t.Helper()
	path := filepath.Join(sim.folder, relDir, name)
	if !strings.HasPrefix(path, sim.folder+string(filepath.Separator)) {
		sim.t.Fatalf("sim: fixture path %q escapes the fixture root %q", path, sim.folder)
	}
	return path
}

// writeFixture creates a scripted file, and its parent directory when JD lands in a package
// subfolder.
func (sim *jdSim) writeFixture(relDir, name string) string {
	sim.t.Helper()
	path := sim.fixturePath(relDir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		sim.t.Fatalf("sim: create fixture directory for %q: %v", path, err)
	}
	if err := os.WriteFile(path, []byte("video"), 0o644); err != nil {
		sim.t.Fatalf("sim: write fixture %q: %v", path, err)
	}
	return path
}

// landsPartAt writes relDir/name+".mp4.part" under the fixture root. ".part" is not in
// config.VideoFileExtensions, so nothing counts as an episode until the transfer finishes --
// which is what makes the closing window observable at all.
func landsPartAt(at time.Duration, relDir, name string) jdAction {
	return jdAction{at: at, do: func(sim *jdSim) {
		sim.t.Helper()
		if len(name) <= simMinFixtureNameLength {
			sim.t.Fatalf("sim: fixture name %q is too short for the production .part sensor", name)
		}
		sim.writeFixture(relDir, name+".mp4.part")
	}}
}

// finishesPartAt renames that .part to name+".mp4" in place and records it as the path JD now
// holds.
func finishesPartAt(at time.Duration, relDir, name string) jdAction {
	return jdAction{at: at, do: func(sim *jdSim) {
		sim.t.Helper()
		part := sim.fixturePath(relDir, name+".mp4.part")
		done := sim.fixturePath(relDir, name+".mp4")
		if err := os.Rename(part, done); err != nil {
			sim.t.Fatalf("sim: finish transfer %q: %v", part, err)
		}
		sim.finished = done
	}}
}

// jdReportsDead flips the status both JD queries answer to a dead verdict. Matched must be
// true: classifyJDStatus reads an unmatched destination as "still downloading", never as dead.
func jdReportsDead(at time.Duration) jdAction {
	return jdAction{at: at, do: func(sim *jdSim) {
		sim.status = jdownloader.DestinationStatus{Matched: true, CrawlOfflineCount: 1}
	}}
}

// newCoreIntegrationService wires the download service against the sim and the REAL filesystem
// adapters. Neither newWatchTestService nor newProbeWatchService may be used here: both call
// setSvcFakeCounter, which replaces Counter AND Flattener, and the second also overwrites
// HasPartFiles. HasPartFiles is left UNSET on purpose so NewService installs the production
// hasPartFilesRecursive sensor -- overriding it would delete this battery's whole subject.
func newCoreIntegrationService(t *testing.T, sim *jdSim, now *time.Time) (*Service, *fieldsRecorder) {
	t.Helper()
	recorder := &fieldsRecorder{}
	deps := baseDeps(t)
	deps.JD = sim
	deps.Counter = filesystem.NewEpisodeCounter()
	deps.Flattener = filesystem.NewFlattener()
	// Clock and PollSleep MUST read the same *time.Time. Repointing only one of them leaves
	// every probe.elapsedMs reading 0 while the simulator never advances, and the battery
	// would run green while exercising nothing.
	deps.Clock = func() time.Time { return *now }
	deps.PollSleep = func(d time.Duration) {
		*now = now.Add(d)
		sim.advanceTo(*now)
	}
	deps.DetectStartPhaseDisabled = false
	deps.RenameEpisodes = func(context.Context) bool { return true }
	deps.Logger = recorder
	return NewService(deps), recorder
}

// seedRootEpisodes writes "Test Anime - 01.mp4" ... "- 0n.mp4" directly at the fixture root.
func seedRootEpisodes(t *testing.T, folder string, n int) {
	t.Helper()
	for i := 1; i <= n; i++ {
		name := fmt.Sprintf("Test Anime - %02d.mp4", i)
		if err := os.WriteFile(filepath.Join(folder, name), []byte("video"), 0o644); err != nil {
			t.Fatalf("seed root episode %d: %v", i, err)
		}
	}
}

// simRootVideoNames lists the video files directly at the fixture root, read with os.ReadDir
// rather than through filesystem.EpisodeCounter: the counter is one of the production adapters
// under test, and an assertion routed through it would pin the subject against itself.
func simRootVideoNames(t *testing.T, folder string) []string {
	t.Helper()
	entries, err := os.ReadDir(folder)
	if err != nil {
		t.Fatalf("read fixture root %q: %v", folder, err)
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".mp4") {
			names = append(names, entry.Name())
		}
	}
	return names
}

// assertRootVideoCount asserts how many video files sit directly at the fixture root.
func assertRootVideoCount(t *testing.T, folder string, want int) {
	t.Helper()
	if got := simRootVideoNames(t, folder); len(got) != want {
		t.Errorf("expected %d video files at the fixture root, got %v", want, got)
	}
}

// assertPathGone asserts a path no longer exists, naming what should have removed it.
func assertPathGone(t *testing.T, path, why string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("expected %q to be gone because %s, stat returned %v", path, why, err)
	}
}

// assertPathStillThere asserts a path survived, naming what should have left it alone.
func assertPathStillThere(t *testing.T, path, why string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected %q to survive because %s, stat returned %v", path, why, err)
	}
}

// assertEntryCount asserts how many entries of one event type were recorded.
func assertEntryCount(t *testing.T, recorder *fieldsRecorder, eventType string, want int) {
	t.Helper()
	if got := len(recorder.byEventType(eventType)); got != want {
		t.Errorf("expected %d %s entries, got %d", want, eventType, got)
	}
}

// assertSimLedger asserts the two JD-side counters every scenario reads: which hosters were
// enqueued, in order, and how many package removals fired.
func assertSimLedger(t *testing.T, sim *jdSim, enqueued []string, removals int) {
	t.Helper()
	if !slices.Equal(sim.enqueued, enqueued) {
		t.Errorf("expected hosters %v to be enqueued, got %v", enqueued, sim.enqueued)
	}
	if sim.removals != removals {
		t.Errorf("expected %d JD package removals, got %d", removals, sim.removals)
	}
}

// assertEnqueueResult asserts the four forensic fields enqueueWithFallback credits to an
// episode. Expected values are LITERALS: asserting against the production symbol being pinned
// would make the test agree with any value that symbol takes.
//
// This helper and the other pure comparisons above report with t.Errorf rather than t.Fatalf,
// so one broken run names EVERY divergence instead of only the first. That is what makes a
// mutation run readable: the deleted post-grace re-check moves five independent readings at
// once, and a fatal first assertion would hide the other four.
func assertEnqueueResult(t *testing.T, result episodeEnqueueResult, succeeded bool, attemptIndex int, exit string, observed int) {
	t.Helper()
	if result.succeeded != succeeded {
		t.Errorf("expected succeeded=%v, got %#v", succeeded, result)
	}
	if result.attemptIndex != attemptIndex {
		t.Errorf("expected attemptIndex=%d, got %d", attemptIndex, result.attemptIndex)
	}
	if string(result.exit) != exit {
		t.Errorf("expected exit=%q, got %q", exit, result.exit)
	}
	if result.observed != observed {
		t.Errorf("expected observed=%d, got %d", observed, result.observed)
	}
}
