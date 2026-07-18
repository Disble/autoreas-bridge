package download

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/jdownloader"
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

func TestClassifyJDStatusDownloadStageErrorTriadIsDead(t *testing.T) {
	t.Parallel()

	st := jdownloader.DestinationStatus{
		Matched: true,
		Links: []jdownloader.LinkSignal{
			{Finished: false, Running: false, Skipped: false, StatusIconKey: "error_download"},
		},
	}
	if got := classifyJDStatus(st); got != verdictDead {
		t.Fatalf("expected verdictDead for the false triad + error-type StatusIconKey, got %v", got)
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
	return contracts.MobileAnime{ID: "anime-1", Nombre: "Test Anime", Carpeta: ptrStr(folder)}
}

func TestAwaitHosterOutcomeReturnsSuccessWhenDiskBaselineExceeded(t *testing.T) {
	t.Parallel()

	folder := "folder-a"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 5}, recursive: map[string]int{folder: 5}}
	jd := &svcFakeJDClient{}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4)
	if outcome.kind != hosterOutcomeSuccess {
		t.Fatalf("expected success outcome when disk baseline is exceeded, got %#v", outcome)
	}
}

func TestAwaitHosterOutcomeFlattensOnRecursiveAppearanceBeforeBaselineRecheck(t *testing.T) {
	t.Parallel()

	folder := "folder-b"
	now := time.Now()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 5}}
	jd := &svcFakeJDClient{}
	s := newWatchTestService(t, jd, counter, &now)

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4)
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

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4)
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

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4)
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

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4)
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

	outcome := s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4)
	if outcome.kind == hosterOutcomeDead {
		t.Fatalf("expected a persistently-downloading verdict to never resolve to dead, got %#v", outcome)
	}
}
