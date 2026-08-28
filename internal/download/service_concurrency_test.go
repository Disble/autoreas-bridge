package download

import (
	"context"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// JDownloader runs only maxsimultanedownloads transfers at a time. Anything Bridge sends
// beyond that sits queued, writes no .part file and reports nothing running -- which the
// hoster watch reads as a dead hoster and kills. Bridge must therefore never have more
// animes in flight than JD will actually run.
func TestProcessAnimesNeverExceedsTheJDDownloadLimit(t *testing.T) {
	t.Parallel()

	const limit = 2

	var mu sync.Mutex
	inFlight, peak := 0, 0

	deps, _ := renameScenario(t)
	deps.MaxConcurrentAnimes = func() int { return limit }

	svc := NewService(deps)
	svc.testHookAnimeStarted = func() {
		mu.Lock()
		inFlight++
		if inFlight > peak {
			peak = inFlight
		}
		mu.Unlock()
	}
	svc.testHookAnimeFinished = func() {
		mu.Lock()
		inFlight--
		mu.Unlock()
	}

	animes := make([]contracts.MobileAnime, 0, 6)
	for range 6 {
		animes = append(animes, contracts.MobileAnime{ID: "a", Name: "X", Folder: new(t.TempDir())})
	}

	svc.processAnimes(context.Background(), "run-1", animes, nil, func(animeProgressDelta) {})

	mu.Lock()
	defer mu.Unlock()
	if peak > limit {
		t.Fatalf("peak concurrency = %d, want at most %d", peak, limit)
	}
	if peak == 0 {
		t.Fatal("no anime ran at all -- the throttle deadlocked")
	}
}

// An unset seam must preserve today's behaviour rather than silently serialising every run.
func TestProcessAnimesRunsUnthrottledWhenTheLimitIsUnknown(t *testing.T) {
	t.Parallel()

	deps, _ := renameScenario(t)
	deps.MaxConcurrentAnimes = nil

	svc := NewService(deps)
	var mu sync.Mutex
	peak, inFlight := 0, 0
	svc.testHookAnimeStarted = func() {
		mu.Lock()
		inFlight++
		if inFlight > peak {
			peak = inFlight
		}
		mu.Unlock()
	}
	svc.testHookAnimeFinished = func() { mu.Lock(); inFlight--; mu.Unlock() }

	animes := make([]contracts.MobileAnime, 0, 4)
	for range 4 {
		animes = append(animes, contracts.MobileAnime{ID: "a", Name: "X", Folder: new(t.TempDir())})
	}

	svc.processAnimes(context.Background(), "run-1", animes, nil, func(animeProgressDelta) {})

	mu.Lock()
	defer mu.Unlock()
	if peak == 0 {
		t.Fatal("no anime ran at all")
	}
}
