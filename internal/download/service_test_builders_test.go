package download

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// fixedJDGate returns a jdGate pre-resolved to the given online status, for tests that call
// processAnime directly (bypassing the run-level lazy resolution wired in executeAnimes).
func fixedJDGate(online bool) *jdGate {
	g := newJDGate(func(context.Context) bool { return online }, nil)
	g.online(context.Background())
	return g
}

// ptrStr returns a pointer to a string value.
func ptrStr(s string) *string { return &s }

// ptrInt returns a pointer to an integer value.
func ptrInt(i int) *int { return &i }

// setSvcFakeCounter installs a fake counter and flattening seam on service deps.
func setSvcFakeCounter(deps *ServiceDeps, counter *svcFakeCounter) {
	deps.Counter = counter
	flattenCalls := map[string]int{}
	var flattenMu sync.Mutex
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) {
		flattenMu.Lock()
		defer flattenMu.Unlock()
		flattenCalls[folder]++
		if flattenCalls[folder] > 1 {
			counter.Flatten(folder)
		}
	}}
}

// todayDiaName returns the Spanish weekday name for a timestamp.
func todayDiaName(now time.Time) string {
	names := map[time.Weekday]string{
		time.Monday:    "Lunes",
		time.Tuesday:   "Martes",
		time.Wednesday: "Miércoles",
		time.Thursday:  "Jueves",
		time.Friday:    "Viernes",
		time.Saturday:  "Sábado",
		time.Sunday:    "Domingo",
	}
	return names[now.Weekday()]
}

// baseDeps builds the common dependency set for service tests.
func baseDeps(t *testing.T) ServiceDeps {
	t.Helper()
	fixedNow := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)
	counter := &svcFakeCounter{atRoot: map[string]int{}, recursive: map[string]int{}}
	return ServiceDeps{
		Animes:                   &svcFakeAnimeQuery{},
		Sites:                    NewStaticRegistry(),
		Hosters:                  &svcFakeHosterResolver{order: []HosterPriorityEntry{{Hoster: "Mediafire", Priority: 0, Enabled: true}}},
		JD:                       &svcFakeJDClient{},
		Counter:                  counter,
		Flattener:                &svcFakeFlattener{onFlatten: counter.Flatten},
		Store:                    newsvcFakeDownloadStore(),
		Notifier:                 &svcFakeNotifier{},
		Bus:                      events.NewBus(),
		Logger:                   sharedlogger.NewFanoutLogger(),
		Clock:                    func() time.Time { return fixedNow },
		NewRunID:                 func() string { return "run-fixed" },
		PollSleep:                func(time.Duration) {},
		DetectStartPhaseDisabled: true,
	}
}

type fallbackAwareJDClient struct {
	*svcFakeJDClient
	failHoster          string
	deadHosters         map[string]bool
	mu                  sync.Mutex
	attemptedHosters    []string
	currentHoster       string
	removedDestinations []string
}

func (f *fallbackAwareJDClient) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	hoster := inferHosterFromURLs(req.URLs)

	f.mu.Lock()
	f.attemptedHosters = append(f.attemptedHosters, hoster)
	f.currentHoster = hoster
	f.mu.Unlock()

	if hoster == f.failHoster {
		return errors.New("hoster down")
	}
	return f.svcFakeJDClient.AddAndStart(ctx, deviceName, req)
}

func (f *fallbackAwareJDClient) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	f.mu.Lock()
	hoster := f.currentHoster
	f.mu.Unlock()

	if f.deadHosters != nil && f.deadHosters[hoster] {
		return jdownloader.DestinationStatus{Matched: true, CrawlOfflineCount: 1}, nil
	}
	return jdownloader.DestinationStatus{}, nil
}

func (f *fallbackAwareJDClient) RemoveByDestination(_ context.Context, _ string, destination string) error {
	f.mu.Lock()
	f.removedDestinations = append(f.removedDestinations, destination)
	f.mu.Unlock()
	return nil
}

// inferHosterFromURLs identifies a known hoster from download URLs.
func inferHosterFromURLs(urls []string) string {
	for _, u := range urls {
		switch {
		case strings.Contains(u, "mediafire"):
			return "Mediafire"
		case strings.Contains(u, "mega"):
			return "Mega"
		}
	}
	return ""
}
