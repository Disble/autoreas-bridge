package download

import (
	"context"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/jdownloader"
)

// fastEnqueueDeps returns service dependencies with immediate enqueue polling.
func fastEnqueueDeps(t *testing.T, folder string, counter *svcFakeCounter) (ServiceDeps, *time.Time) {
	t.Helper()
	deps := baseDeps(t)
	setSvcFakeCounter(&deps, counter)
	now := deps.Clock()
	deps.Clock = func() time.Time { return now }
	deps.PollSleep = func(d time.Duration) { now = now.Add(d) }
	return deps, &now
}

func TestEnqueueWithFallbackAdvancesToNextHosterWhenFirstIsDeadWithoutWaitingForTimeout(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 0}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true}}
	deps.JD = jd
	s := NewService(deps)

	anime := contracts.MobileAnime{ID: "anime-1", Name: "Anime", Folder: ptrStr(folder)}
	ordered := []hosterLink{{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}}, {hoster: "Mega", links: []string{"http://mega.example/1"}}}

	_, _ = s.enqueueWithFallback(context.Background(), "run-1", anime, ordered, 1)

	if len(jd.attemptedHosters) != 2 || jd.attemptedHosters[0] != "Mediafire" || jd.attemptedHosters[1] != "Mega" {
		t.Fatalf("expected dead Mediafire to advance immediately to Mega, got %v", jd.attemptedHosters)
	}
}

func TestEnqueueWithFallbackReturnsHosterDownWhenEveryHosterIsDead(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 0}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, deadHosters: map[string]bool{"Mediafire": true, "Mega": true}}
	deps.JD = jd
	s := NewService(deps)

	anime := contracts.MobileAnime{ID: "anime-1", Name: "Anime", Folder: ptrStr(folder)}
	ordered := []hosterLink{{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}}, {hoster: "Mega", links: []string{"http://mega.example/1"}}}

	enqueued, failureKind := s.enqueueWithFallback(context.Background(), "run-1", anime, ordered, 1)

	if enqueued {
		t.Fatal("expected enqueueWithFallback to report failure once every hoster is dead")
	}
	if failureKind != FailureKindHosterDown {
		t.Fatalf("expected failure kind %q for an exhausted dead fallback list, got %q", FailureKindHosterDown, failureKind)
	}
	if len(jd.attemptedHosters) != 2 {
		t.Fatalf("expected both hosters to be attempted promptly, got %v", jd.attemptedHosters)
	}
}

func TestEnqueueWithFallbackStillAdvancesOnAddAndStartAPIError(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 1}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	jd := &fallbackAwareJDClient{svcFakeJDClient: &svcFakeJDClient{}, failHoster: "Mediafire"}
	deps.JD = jd
	s := NewService(deps)

	anime := contracts.MobileAnime{ID: "anime-1", Name: "Anime", Folder: ptrStr(folder)}
	ordered := []hosterLink{{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}}, {hoster: "Mega", links: []string{"http://mega.example/1"}}}

	enqueued, _ := s.enqueueWithFallback(context.Background(), "run-1", anime, ordered, 1)

	if !enqueued {
		t.Fatal("expected the 2nd hoster's disk-confirmed success to report enqueued=true")
	}
	if len(jd.attemptedHosters) != 2 || jd.attemptedHosters[0] != "Mediafire" || jd.attemptedHosters[1] != "Mega" {
		t.Fatalf("expected an AddAndStart API error to still advance to the next hoster, got %v", jd.attemptedHosters)
	}
}

type diskSuccessOnFirstAddAndStart struct {
	*svcFakeJDClient
	counter *svcFakeCounter
	folder  string
	mu      sync.Mutex
	calls   []string
}

func (f *diskSuccessOnFirstAddAndStart) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	hoster := inferHosterFromURLs(req.URLs)
	f.mu.Lock()
	f.calls = append(f.calls, hoster)
	f.mu.Unlock()
	f.counter.mu.Lock()
	f.counter.atRoot[f.folder]++
	f.counter.mu.Unlock()
	return nil
}

func TestEnqueueWithFallbackShortCircuitsOnFirstHosterDiskSuccess(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 0}}
	deps, _ := fastEnqueueDeps(t, folder, counter)
	jd := &diskSuccessOnFirstAddAndStart{svcFakeJDClient: &svcFakeJDClient{}, counter: counter, folder: folder}
	deps.JD = jd
	s := NewService(deps)

	anime := contracts.MobileAnime{ID: "anime-1", Name: "Anime", Folder: ptrStr(folder)}
	ordered := []hosterLink{{hoster: "Mediafire", links: []string{"http://mediafire.example/1"}}, {hoster: "Mega", links: []string{"http://mega.example/1"}}}

	enqueued, _ := s.enqueueWithFallback(context.Background(), "run-1", anime, ordered, 1)

	if !enqueued {
		t.Fatal("expected the first hoster's immediate disk success to report enqueued=true")
	}
	if len(jd.calls) != 1 || jd.calls[0] != "Mediafire" {
		t.Fatalf("expected disk success to short-circuit before trying the 2nd hoster, got %v", jd.calls)
	}
}
