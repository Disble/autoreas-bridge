package download

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

func TestRunOncePublishesLiveProgressBeforeAllAnimeWorkersFinish(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	folderA := t.TempDir()
	folderB := t.TempDir()
	store := newLiveProgressStore()
	deps.Store = store

	source := &blockingLiveProgressSource{
		releaseB:     make(chan struct{}),
		listStartedB: make(chan struct{}),
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-a",
		Name:      "Anime A",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/a/"),
		Folder:    ptrStr(folderA),
	}, {
		ID:        "anime-b",
		Name:      "Anime B",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/b/"),
		Folder:    ptrStr(folderB),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{folderA: 0, folderB: 0},
		recursive: map[string]int{folderA: 1, folderB: 0},
	})

	bus := events.NewBus()
	progressEvents := make(chan struct{}, 8)
	bus.Subscribe(events.EventNameDownloadRunProgress, func(event events.Event) {
		progressEvents <- struct{}{}
	})
	deps.Bus = bus

	resultCh, errCh := startLiveProgressRun(deps)

	awaitLiveProgressWorker(t, source.listStartedB)
	midRun := store.waitForProgress(func(run Run) bool {
		return run.Status == "running" && run.FinishedAtMs == nil && run.EpisodesFound == 1 &&
			run.EpisodesDownloaded == 1 && run.AnimesChecked == 1
	}, time.Second)
	if midRun == nil {
		t.Fatal("expected persisted live-progress snapshot before run completion")
	}
	assertRunStillPending(t, errCh, resultCh)
	assertListedLiveProgress(t, store)
	awaitLiveProgressEvent(t, progressEvents)

	close(source.releaseB)
	assertLiveProgressRunCompleted(t, store, errCh, resultCh)
}

// awaitLiveProgressWorker waits for a worker to reach its blocking point.
func awaitLiveProgressWorker(t *testing.T, started <-chan struct{}) {
	t.Helper()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("expected second anime worker to start and block")
	}
}

// assertRunStillPending verifies the asynchronous run has not completed yet.
func assertRunStillPending(t *testing.T, errCh <-chan error, resultCh <-chan RunResult) {
	t.Helper()
	select {
	case err := <-errCh:
		t.Fatalf("RunOnce returned too early with error: %v", err)
	case result := <-resultCh:
		t.Fatalf("RunOnce returned too early with result: %#v", result)
	default:
	}
}

// assertListedLiveProgress verifies live counters are visible through ListRuns.
func assertListedLiveProgress(t *testing.T, store *liveProgressStore) {
	t.Helper()
	runs, err := store.ListRuns(context.Background(), 10)
	if err != nil || len(runs) != 1 {
		t.Fatalf("expected one running row, runs=%#v err=%v", runs, err)
	}
	if runs[0].EpisodesFound != 1 || runs[0].EpisodesDownloaded != 1 || runs[0].AnimesChecked != 1 {
		t.Fatalf("expected ListRuns to expose live counters mid-run, got %#v", runs[0])
	}
}

// awaitLiveProgressEvent waits for a progress event before terminal completion.
func awaitLiveProgressEvent(t *testing.T, progressEvents <-chan struct{}) {
	t.Helper()
	select {
	case <-progressEvents:
	case <-time.After(time.Second):
		t.Fatal("expected download.run_progress event before terminal completion")
	}
}

// assertLiveProgressRunCompleted verifies final status and aggregate counters.
func assertLiveProgressRunCompleted(t *testing.T, store *liveProgressStore, errCh <-chan error, resultCh <-chan RunResult) {
	t.Helper()
	select {
	case err := <-errCh:
		t.Fatalf("RunOnce: %v", err)
	case result := <-resultCh:
		if result.Status != RunStatusOK {
			t.Fatalf("expected final status %q, got %q", RunStatusOK, result.Status)
		}
		finalRun, ok := store.getRun(result.RunID)
		if !ok || finalRun.AnimesChecked != 2 || finalRun.EpisodesFound != 1 || finalRun.EpisodesDownloaded != 1 || finalRun.UpToDateCount != 1 {
			t.Fatalf("expected final counters without duplication, got %#v", finalRun)
		}
	case <-time.After(time.Second):
		t.Fatal("expected RunOnce to finish after releasing blocked anime")
	}
}

func TestRunOnceSerializesProgressSnapshotsAcrossPersistenceAndEvents(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	folderA := t.TempDir()
	folderB := t.TempDir()
	store := newOrderedProgressStore()
	deps.Store = store

	source := &orderedLiveProgressSource{
		releaseB:     make(chan struct{}),
		listStartedB: make(chan struct{}),
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-a",
		Name:      "Anime A",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/a/"),
		Folder:    ptrStr(folderA),
	}, {
		ID:        "anime-b",
		Name:      "Anime B",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/b/"),
		Folder:    ptrStr(folderB),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{folderA: 0, folderB: 0},
		recursive: map[string]int{folderA: 0, folderB: 0},
	})

	bus := events.NewBus()
	progressChecks := subscribeOrderedProgressChecks(bus, store)
	deps.Bus = bus

	resultCh, errCh := startLiveProgressRun(deps)

	awaitOrderedProgressStart(t, source.listStartedB, store.olderSnapshotStarted)

	close(source.releaseB)
	assertNewerOrderedProgressBlocked(t, store, progressChecks)

	close(store.releaseOlderSnapshot)
	awaitOrderedProgressRun(t, errCh, resultCh)
	assertOrderedProgressSequences(t, store, progressChecks)
}
