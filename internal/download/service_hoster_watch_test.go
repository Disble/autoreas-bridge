package download

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/events"
)

// --- classifyJDStatus truth table (download-sites "JD Status Classification by Destination
// Folder") ---

func TestClassifyJDStatusOfflineOnlyIsDead(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{Matched: true, CrawlOnlineCount: 0, CrawlOfflineCount: 2}
	if got := classifyJDStatus(st); got != verdictDead {
		t.Fatalf("expected verdictDead for OFFLINE-only crawl status, got %v", got)
	}
}

func TestClassifyJDStatusPackageStageUnknownStateWithErrorIconStaysDownloading(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		sig  jdownloader.PackageSignal
	}{
		{
			name: "both booleans omitted",
			sig:  jdownloader.PackageSignal{StatusIconKey: "error_file_not_found"},
		},
		{
			name: "running omitted",
			sig: jdownloader.PackageSignal{
				Finished:         false,
				FinishedObserved: true,
				StatusIconKey:    "error_file_not_found",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			st := jdownloader.DestinationStatus{
				Matched:        true,
				PackageSignals: []jdownloader.PackageSignal{tc.sig},
			}
			if got := classifyJDStatus(st); got != verdictDownloading {
				t.Fatalf("expected verdictDownloading for unknown package state with error icon, got %v", got)
			}
		})
	}
}

func TestClassifyJDStatusAnyOnlineCrawlLinkOutvotesStaleOfflineAndIsDownloading(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{Matched: true, CrawlOnlineCount: 1, CrawlOfflineCount: 3}
	if got := classifyJDStatus(st); got != verdictDownloading {
		t.Fatalf("expected verdictDownloading when any crawl link is ONLINE (self-heal), got %v", got)
	}
}

func TestClassifyJDStatusRunningLinkIsDownloading(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{
		Matched: true,
		Links:   []jdownloader.LinkSignal{{Running: true}},
	}
	if got := classifyJDStatus(st); got != verdictDownloading {
		t.Fatalf("expected verdictDownloading for a running download link, got %v", got)
	}
}

func TestClassifyJDStatusRunningPackageOutvotesStalePackageErrorAndStaysDownloading(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{
		Matched:        true,
		PackageSignals: []jdownloader.PackageSignal{{Finished: false, Running: true, FinishedObserved: true, RunningObserved: true, StatusIconKey: "error_file_not_found"}},
	}
	if got := classifyJDStatus(st); got != verdictDownloading {
		t.Fatalf("expected verdictDownloading for a running package even with stale error icon, got %v", got)
	}
}

func TestClassifyJDStatusUnmatchedIsDownloadingNotDead(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{Matched: false}
	if got := classifyJDStatus(st); got != verdictDownloading {
		t.Fatalf("expected verdictDownloading when nothing has crawled/enqueued yet, got %v", got)
	}
}

func TestClassifyJDStatusFinishedAloneIsFinishedOK(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{
		Matched: true,
		Links:   []jdownloader.LinkSignal{{Finished: true}},
	}
	if got := classifyJDStatus(st); got != verdictFinishedOK {
		t.Fatalf("expected verdictFinishedOK, got %v", got)
	}
}

func TestClassifyJDStatusFreeFormStatusTextAloneNeverTriggersDead(t *testing.T) {
	t.Parallel()

	// StatusIconKey is not an error-type key, and the boolean triad is not all-false (Skipped
	// is true) -- classifyJDStatus MUST NOT infer "dead" from any free-form Status text (which
	// this neutral struct does not even carry, by design).
	st := jdownloader.DestinationStatus{
		Matched: true,
		Links:   []jdownloader.LinkSignal{{Finished: false, Running: false, Skipped: true, StatusIconKey: "queued"}},
	}
	if got := classifyJDStatus(st); got == verdictDead {
		t.Fatalf("expected classifier to NOT return verdictDead for a non-error StatusIconKey, got %v", got)
	}
}

func TestClassifyJDStatusNonErrorOrEmptyPackageIconStaysDownloading(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		icon string
	}{
		{name: "empty", icon: ""},
		{name: "unknown", icon: "queued"},
		{name: "finished", icon: "finished"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			st := jdownloader.DestinationStatus{
				Matched:        true,
				PackageSignals: []jdownloader.PackageSignal{{Finished: false, Running: false, FinishedObserved: true, RunningObserved: true, StatusIconKey: tc.icon}},
			}
			if got := classifyJDStatus(st); got != verdictDownloading {
				t.Fatalf("expected verdictDownloading for package icon %q, got %v", tc.icon, got)
			}
		})
	}
}

// --- awaitHosterOutcome ---

// newWatchTestService builds a service with controllable hoster-watch dependencies.
func newWatchTestService(t *testing.T, jd jdownloader.JDClient, counter *svcFakeCounter, now *time.Time) *Service {
	t.Helper()
	deps := baseDeps(t)
	deps.JD = jd
	setSvcFakeCounter(&deps, counter)
	deps.Clock = func() time.Time { return *now }
	deps.PollSleep = func(d time.Duration) { *now = now.Add(d) }
	return NewService(deps)
}

// testAnime builds the minimal anime used by hoster-watch tests.
func testAnime(folder string) contracts.MobileAnime {
	return contracts.MobileAnime{ID: "anime-1", Name: "Test Anime", Folder: new(folder)}
}

func TestAwaitHosterOutcomeReturnsSuccessWhenDiskBaselineExceeded(t *testing.T) {
	t.Parallel()

	folder := "folder-a"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 5}, recursive: map[string]int{folder: 5}}
	jd := &svcFakeJDClient{}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind != hosterOutcomeSuccess {
		t.Fatalf("expected success outcome when disk baseline is exceeded, got %#v", outcome)
	}
}

func TestAwaitHosterOutcomeFlattensJDownloaderPackageWhenRootSignalsCompletion(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	packageFolder := filepath.Join(root, "9gm31meptrvq")
	rootVideo := filepath.Join(root, "episode-01.mp4")
	nestedVideo := filepath.Join(packageFolder, "episode-02.mp4")
	if err := os.MkdirAll(packageFolder, 0o755); err != nil {
		t.Fatalf("create JDownloader package folder: %v", err)
	}
	if err := os.WriteFile(rootVideo, []byte("video"), 0o600); err != nil {
		t.Fatalf("create root video: %v", err)
	}
	if err := os.WriteFile(nestedVideo, []byte("video"), 0o600); err != nil {
		t.Fatalf("create nested video: %v", err)
	}

	now := time.Now()
	deps := baseDeps(t)
	deps.Counter = filesystem.NewEpisodeCounter()
	deps.Flattener = filesystem.NewFlattener()
	deps.Clock = func() time.Time { return now }
	s := NewService(deps)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(root), "Mediafire", 0, 1, true)
	if outcome.kind != hosterOutcomeSuccess {
		t.Fatalf("expected success outcome, got %#v", outcome)
	}
	if _, err := os.Stat(rootVideo); err != nil {
		t.Fatalf("expected existing root video to remain in place: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.Base(nestedVideo))); err != nil {
		t.Fatalf("expected JDownloader video at root: %v", err)
	}
	if _, err := os.Stat(packageFolder); !os.IsNotExist(err) {
		t.Fatalf("expected emptied JDownloader package folder removed, stat err: %v", err)
	}
}

func TestAwaitHosterOutcomeFlattensOnRecursiveAppearanceBeforeBaselineRecheck(t *testing.T) {
	t.Parallel()

	folder := "folder-b"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 5}}
	jd := &svcFakeJDClient{}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind != hosterOutcomeSuccess {
		t.Fatalf("expected the Flatten-on-appear + baseline recheck to report success, got %#v", outcome)
	}
}

type deadJDClient struct {
	*svcFakeJDClient
	removeCalls []string
	removeErr   error
}

func (f *deadJDClient) PackageStatusByDestination(ctx context.Context, deviceName, destination string) (jdownloader.DestinationStatus, error) {
	return jdownloader.DestinationStatus{Matched: true, CrawlOfflineCount: 1}, nil
}

func (f *deadJDClient) RemoveByDestination(ctx context.Context, deviceName, destination string) error {
	f.removeCalls = append(f.removeCalls, destination)
	return f.removeErr
}

func TestAwaitHosterOutcomeReturnsDeadAndRemovesThePackage(t *testing.T) {
	t.Parallel()

	folder := "folder-c"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	jd := &deadJDClient{svcFakeJDClient: &svcFakeJDClient{}}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind != hosterOutcomeDead {
		t.Fatalf("expected dead outcome, got %#v", outcome)
	}
	if len(jd.removeCalls) != 1 || jd.removeCalls[0] != folder {
		t.Fatalf("expected RemoveByDestination to be called for %q, got %v", folder, jd.removeCalls)
	}
}

func TestAwaitHosterOutcomeAdvancesEvenWhenRemoveFails(t *testing.T) {
	t.Parallel()

	folder := "folder-d"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	jd := &deadJDClient{svcFakeJDClient: &svcFakeJDClient{}, removeErr: errors.New("remove failed")}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind != hosterOutcomeDead {
		t.Fatalf("expected dead outcome even when Remove fails, got %#v", outcome)
	}
}

type downloadingJDClient struct {
	*svcFakeJDClient
}

func (f *downloadingJDClient) PackageStatusByDestination(ctx context.Context, deviceName, destination string) (jdownloader.DestinationStatus, error) {
	return jdownloader.DestinationStatus{Matched: true, Links: []jdownloader.LinkSignal{{Running: true}}}, nil
}

func TestAwaitHosterOutcomeReturnsTimeoutWhenNeitherDiskNorDeadWithinDeadline(t *testing.T) {
	t.Parallel()

	folder := "folder-e"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	jd := &downloadingJDClient{svcFakeJDClient: &svcFakeJDClient{}}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind != hosterOutcomeTimeout {
		t.Fatalf("expected timeout outcome when neither disk nor dead resolve within the deadline, got %#v", outcome)
	}
}

func TestAwaitHosterOutcomeDownloadingVerdictNeverTriggersFallbackUnderTimeout(t *testing.T) {
	t.Parallel()

	folder := "folder-f"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	jd := &downloadingJDClient{svcFakeJDClient: &svcFakeJDClient{}}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind == hosterOutcomeDead {
		t.Fatalf("expected a persistently-downloading verdict to never resolve to dead, got %#v", outcome)
	}
}

// --- hasPartFilesRecursive ---

func TestHasPartFilesRecursiveEmptyFolderReturnsFalse(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if hasPartFilesRecursive(dir) {
		t.Fatal("expected false for empty folder")
	}
}

func TestHasPartFilesRecursiveFindsPartFileAtRoot(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "anime-ep01.part"), []byte("data"), 0o644); err != nil {
		t.Fatalf("write part file: %v", err)
	}
	if !hasPartFilesRecursive(dir) {
		t.Fatal("expected true when a .part file exists at root")
	}
}

func TestHasPartFilesRecursiveFindsPartFileInSubfolder(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	sub := filepath.Join(dir, "subfolder")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sub, "anime-ep01.part"), []byte("data"), 0o644); err != nil {
		t.Fatalf("write part file: %v", err)
	}
	if !hasPartFilesRecursive(dir) {
		t.Fatal("expected true when a .part file exists in a subfolder")
	}
}

func TestHasPartFilesRecursiveIgnoresNonPartFiles(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "anime-ep01.mp4"), []byte("data"), 0o644); err != nil {
		t.Fatalf("write mp4 file: %v", err)
	}
	if hasPartFilesRecursive(dir) {
		t.Fatal("expected false when only non-.part files exist")
	}
}

func TestHasPartFilesRecursiveSkipsInaccessiblePaths(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	sub := filepath.Join(dir, "locked")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sub, "file.part"), []byte("data"), 0o644); err != nil {
		t.Fatalf("write part file: %v", err)
	}
	if err := os.Chmod(sub, 0o000); err != nil {
		t.Skipf("cannot chmod on this platform: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(sub, 0o755) })

	// WalkDir should skip the locked directory without error.
	hasPartFilesRecursive(dir)
}

// --- detectDownloadStartPhase ---

func TestDetectDownloadStartPhasePartFoundImmediatelyReturnsStarted(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.DetectStartPhaseDisabled = false
	deps.HasPartFiles = func(root string) bool { return true }
	bus := events.NewBus()
	deps.Bus = bus
	s := NewService(deps)

	started, outcome := s.detectDownloadStartPhase(context.Background(), "run-1", "anime-1", "/fake/folder", 3)
	if !started {
		t.Fatalf("expected started=true when HasPartFiles returns true, got outcome=%#v", outcome)
	}
	if outcome != nil {
		t.Fatalf("expected nil outcome when started=true, got %#v", outcome)
	}
}

func TestDetectDownloadStartPhasePublishesEventWhenPartFound(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.DetectStartPhaseDisabled = false
	deps.HasPartFiles = func(root string) bool { return true }
	bus := events.NewBus()
	deps.Bus = bus
	s := NewService(deps)

	var published events.DownloadEpisodeDownloadingEvent
	bus.Subscribe(events.EventNameDownloadEpisodeDownloading, func(e events.Event) {
		if ev, ok := e.(events.DownloadEpisodeDownloadingEvent); ok {
			published = ev
		}
	})

	started, _ := s.detectDownloadStartPhase(context.Background(), "run-1", "anime-1", "/fake/folder", 3)
	if !started {
		t.Fatal("expected started=true")
	}
	if published.RunID != "run-1" || published.AnimeID != "anime-1" || published.Episode != 3 {
		t.Fatalf("expected published event with run-1/anime-1/3, got %#v", published)
	}
}

func TestDetectDownloadStartPhaseNeverFindsPartReturnsDead(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.DetectStartPhaseDisabled = false
	deps.HasPartFiles = func(root string) bool { return false }
	deps.PollSleep = func(d time.Duration) {} // no-op, instant
	s := NewService(deps)

	started, outcome := s.detectDownloadStartPhase(context.Background(), "run-1", "anime-1", "/fake/folder", 3)
	if started {
		t.Fatal("expected started=false when HasPartFiles never returns true")
	}
	if outcome == nil || outcome.kind != hosterOutcomeDead {
		t.Fatalf("expected dead outcome, got %#v", outcome)
	}
}

func TestDetectDownloadStartPhaseDisabledReturnsStartedImmediately(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.DetectStartPhaseDisabled = true
	s := NewService(deps)

	started, outcome := s.detectDownloadStartPhase(context.Background(), "run-1", "anime-1", "/fake/folder", 3)
	if !started {
		t.Fatal("expected started=true when phase is disabled")
	}
	if outcome != nil {
		t.Fatalf("expected nil outcome when disabled, got %#v", outcome)
	}
}

// --- awaitHosterOutcome detect-phase dead path ---

type detectDeadJDClient struct {
	*svcFakeJDClient
	removeCalls []string
}

func (f *detectDeadJDClient) RemoveByDestination(ctx context.Context, deviceName, destination string) error {
	f.removeCalls = append(f.removeCalls, destination)
	return nil
}

func TestAwaitHosterOutcomeRemovesPackageWhenDetectPhaseReturnsDead(t *testing.T) {
	t.Parallel()

	folder := "folder-detect-dead"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	jd := &detectDeadJDClient{svcFakeJDClient: &svcFakeJDClient{}}
	s := newWatchTestService(t, jd, counter, &now)
	// Enable detect phase so it runs. HasPartFiles defaults to real hasPartFilesRecursive which
	// returns false for a non-existent folder, so the detect phase expires and returns dead.
	s.deps.DetectStartPhaseDisabled = false

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 1, true)
	if outcome.kind != hosterOutcomeDead {
		t.Fatalf("expected dead outcome from detect phase, got %#v", outcome)
	}
	if len(jd.removeCalls) != 1 || jd.removeCalls[0] != folder {
		t.Fatalf("expected RemoveByDestination to be called for %q after detect-phase dead, got %v", folder, jd.removeCalls)
	}
}

func (f *deadJDClient) RenameEpisodeByDestination(_ context.Context, _, _, baseName string) (string, error) {
	return baseName + ".mp4", nil
}

func (f *detectDeadJDClient) RenameEpisodeByDestination(_ context.Context, _, _, baseName string) (string, error) {
	return baseName + ".mp4", nil
}
