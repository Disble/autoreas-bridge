package download

import (
	"context"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/events"
)

// subscribeOrderedProgressChecks subscribes to persisted progress counters for ordering assertions.
func subscribeOrderedProgressChecks(bus events.Bus, store *orderedProgressStore) <-chan int {
	progressChecks := make(chan int, 8)
	bus.Subscribe(events.EventNameDownloadRunProgress, func(event events.Event) {
		progress, ok := event.(events.DownloadRunProgressEvent)
		if !ok {
			return
		}
		run, exists := store.getRun(progress.RunID)
		if !exists {
			return
		}
		progressChecks <- run.AnimesChecked
	})
	return progressChecks
}

// awaitOrderedProgressStart waits until the worker and its first blocked snapshot have started.
func awaitOrderedProgressStart(t *testing.T, workerStarted, snapshotStarted <-chan struct{}) {
	t.Helper()
	awaitLiveProgressWorker(t, workerStarted)
	select {
	case <-snapshotStarted:
	case <-time.After(time.Second):
		t.Fatal("expected older progress snapshot to block in persistence")
	}
}

// assertNewerOrderedProgressBlocked verifies newer progress cannot pass the older snapshot.
func assertNewerOrderedProgressBlocked(t *testing.T, store *orderedProgressStore, progressChecks <-chan int) {
	t.Helper()
	if snapshot := store.waitForProgress(func(run Run) bool { return run.AnimesChecked >= 2 }, 150*time.Millisecond); snapshot != nil {
		t.Fatalf("expected newer snapshot to stay blocked until older persistence finishes, got %#v", snapshot)
	}
	if count := waitForCheckedProgressEvent(progressChecks, 2, 150*time.Millisecond); count != nil {
		t.Fatalf("expected newer progress event to stay blocked until older persistence finishes, got checked=%d", *count)
	}
}

// awaitOrderedProgressRun waits for the ordered progress run to finish successfully.
func awaitOrderedProgressRun(t *testing.T, errCh <-chan error, resultCh <-chan RunResult) {
	t.Helper()
	select {
	case err := <-errCh:
		t.Fatalf("RunOnce: %v", err)
	case result := <-resultCh:
		if result.Status != RunStatusOK {
			t.Fatalf("expected final status %q, got %q", RunStatusOK, result.Status)
		}
	case <-time.After(time.Second):
		t.Fatal("expected RunOnce to finish after releasing delayed progress persistence")
	}
}

// assertOrderedProgressSequences verifies monotonic persisted and published progress.
func assertOrderedProgressSequences(t *testing.T, store *orderedProgressStore, progressChecks <-chan int) {
	t.Helper()
	checkedSequence := snapshotCheckedSequence(store.progressSnapshots())
	if !isNonDecreasing(checkedSequence) {
		t.Fatalf("expected persisted progress counters to stay monotonic, got %v", checkedSequence)
	}
	eventSequence := collectCheckedProgressEvents(progressChecks, 250*time.Millisecond)
	if !isNonDecreasing(eventSequence) || !containsInt(eventSequence, 1) || !containsInt(eventSequence, 2) {
		t.Fatalf("expected monotonic incremental progress events, got %v", eventSequence)
	}
	finalRun, ok := store.latestRun()
	if !ok || finalRun.AnimesChecked != 2 || finalRun.UpToDateCount != 2 {
		t.Fatalf("expected final persisted counters to reflect both anime, got %#v", finalRun)
	}
}

// startLiveProgressRun starts RunOnce asynchronously for live-progress tests.
func startLiveProgressRun(deps ServiceDeps) (<-chan RunResult, <-chan error) {
	resultCh := make(chan RunResult, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
		if err != nil {
			errCh <- err
			return
		}
		resultCh <- result
	}()
	return resultCh, errCh
}

type blockingLiveProgressSource struct {
	releaseB     chan struct{}
	listStartedB chan struct{}
	once         sync.Once
}

type orderedLiveProgressSource struct {
	releaseB     chan struct{}
	listStartedB chan struct{}
	once         sync.Once
}

func (s *blockingLiveProgressSource) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: "jkanime", Priority: 0}
}

func (s *blockingLiveProgressSource) Matches(string) bool { return true }

func (s *blockingLiveProgressSource) ListEpisodes(ctx context.Context, pageURL string) (sites.EpisodeListing, error) {
	if strings.Contains(pageURL, "/a/") {
		return sites.EpisodeListing{LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/a/1/"}, nil
	}
	s.once.Do(func() { close(s.listStartedB) })
	<-s.releaseB
	return sites.EpisodeListing{LatestEpisode: 0, EpisodePageURL: "https://jkanime.net/b/0/"}, nil
}

func (s *blockingLiveProgressSource) EpisodePageURL(context.Context, string, int) (string, error) {
	return "https://jkanime.net/a/1/", nil
}

func (s *blockingLiveProgressSource) ExtractLinks(context.Context, string) ([]sites.DownloadLink, error) {
	return []sites.DownloadLink{{URL: "http://mediafire.example/a/1", Hoster: "Mediafire"}}, nil
}

func (s *orderedLiveProgressSource) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: "jkanime", Priority: 0}
}

func (s *orderedLiveProgressSource) Matches(string) bool { return true }

func (s *orderedLiveProgressSource) ListEpisodes(ctx context.Context, pageURL string) (sites.EpisodeListing, error) {
	if strings.Contains(pageURL, "/a/") {
		return sites.EpisodeListing{LatestEpisode: 0, EpisodePageURL: "https://jkanime.net/a/0/"}, nil
	}
	s.once.Do(func() { close(s.listStartedB) })
	<-s.releaseB
	return sites.EpisodeListing{LatestEpisode: 0, EpisodePageURL: "https://jkanime.net/b/0/"}, nil
}

func (s *orderedLiveProgressSource) EpisodePageURL(context.Context, string, int) (string, error) {
	return "", nil
}

func (s *orderedLiveProgressSource) ExtractLinks(context.Context, string) ([]sites.DownloadLink, error) {
	return nil, nil
}

type liveProgressStore struct {
	*svcFakeDownloadStore
	updates chan Run
}

type orderedProgressStore struct {
	*svcFakeDownloadStore
	updates              chan Run
	olderSnapshotStarted chan struct{}
	releaseOlderSnapshot chan struct{}
	once                 sync.Once
}

// newLiveProgressStore creates a store that records live progress updates.
func newLiveProgressStore() *liveProgressStore {
	return &liveProgressStore{svcFakeDownloadStore: newsvcFakeDownloadStore(), updates: make(chan Run, 16)}
}

// newOrderedProgressStore creates a store that can block ordered snapshots.
func newOrderedProgressStore() *orderedProgressStore {
	return &orderedProgressStore{
		svcFakeDownloadStore: newsvcFakeDownloadStore(),
		updates:              make(chan Run, 16),
		olderSnapshotStarted: make(chan struct{}),
		releaseOlderSnapshot: make(chan struct{}),
	}
}

func (s *liveProgressStore) UpdateRunProgress(ctx context.Context, run Run) error {
	if err := s.svcFakeDownloadStore.UpdateRunProgress(ctx, run); err != nil {
		return err
	}
	s.updates <- run
	return nil
}

// waitForProgress waits for a stored run matching the supplied predicate.
func (s *liveProgressStore) waitForProgress(match func(Run) bool, timeout time.Duration) *Run {
	deadline := time.After(timeout)
	for {
		select {
		case run := <-s.updates:
			if match(run) {
				copyRun := run
				return &copyRun
			}
		case <-deadline:
			return nil
		}
	}
}

func (s *orderedProgressStore) UpdateRunProgress(ctx context.Context, run Run) error {
	if run.Status == "running" && run.FinishedAtMs == nil && run.AnimesChecked == 1 && run.UpToDateCount == 1 {
		s.once.Do(func() {
			close(s.olderSnapshotStarted)
			<-s.releaseOlderSnapshot
		})
	}
	if err := s.svcFakeDownloadStore.UpdateRunProgress(ctx, run); err != nil {
		return err
	}
	s.updates <- run
	return nil
}

// waitForProgress waits for an ordered stored run matching the supplied predicate.
func (s *orderedProgressStore) waitForProgress(match func(Run) bool, timeout time.Duration) *Run {
	deadline := time.After(timeout)
	for {
		select {
		case run := <-s.updates:
			if match(run) {
				copyRun := run
				return &copyRun
			}
		case <-deadline:
			return nil
		}
	}
}

// latestRun returns one run currently held by the ordered progress store.
func (s *orderedProgressStore) latestRun() (Run, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, run := range s.runs {
		return run, true
	}
	return Run{}, false
}

// waitForCheckedProgressEvent waits for a progress event reaching the target count.
func waitForCheckedProgressEvent(progressChecks <-chan int, target int, timeout time.Duration) *int {
	deadline := time.After(timeout)
	for {
		select {
		case checked := <-progressChecks:
			if checked >= target {
				result := checked
				return &result
			}
		case <-deadline:
			return nil
		}
	}
}

// collectCheckedProgressEvents gathers progress events until the settling period expires.
func collectCheckedProgressEvents(progressChecks <-chan int, settle time.Duration) []int {
	sequence := []int{}
	deadline := time.After(settle)
	for {
		select {
		case checked := <-progressChecks:
			sequence = append(sequence, checked)
		case <-deadline:
			return sequence
		}
	}
}

// snapshotCheckedSequence extracts checked counters from stored run snapshots.
func snapshotCheckedSequence(runs []Run) []int {
	sequence := make([]int, 0, len(runs))
	for _, run := range runs {
		sequence = append(sequence, run.AnimesChecked)
	}
	return sequence
}

// isNonDecreasing reports whether values never decrease.
func isNonDecreasing(values []int) bool {
	for i := 1; i < len(values); i++ {
		if values[i] < values[i-1] {
			return false
		}
	}
	return true
}

// containsInt reports whether target appears in values.
func containsInt(values []int, target int) bool {
	return slices.Contains(values, target)
}
