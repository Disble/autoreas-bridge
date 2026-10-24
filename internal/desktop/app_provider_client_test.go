package desktop

import (
	"path/filepath"
	"strings"
	"testing"

	"autoreas-bridge/internal/cfclearance"
	"autoreas-bridge/internal/events"
)

// recordingBus counts the events published through it; Subscribe is inert.
type recordingBus struct {
	published []events.Event
}

func (b *recordingBus) Publish(e events.Event) { b.published = append(b.published, e) }

func (b *recordingBus) Subscribe(string, events.Handler) func() { return func() {} }

// TestProviderHTTPClientIsSharedAndClearsChallenges pins the composition
// root's provider egress (ADR-030): every call returns the one client, and
// its transport is the clearance decorator every provider request crosses.
func TestProviderHTTPClientIsSharedAndClearsChallenges(t *testing.T) {
	t.Parallel()
	a := &App{}
	client := a.providerHTTPClient()
	if client == nil {
		t.Fatal("providerHTTPClient returned nil")
	}
	if again := a.providerHTTPClient(); again != client {
		t.Fatalf("providerHTTPClient returned %p then %p, want one shared client", client, again)
	}
	if _, ok := client.Transport.(*cfclearance.Transport); !ok {
		t.Fatalf("transport = %T, want *cfclearance.Transport", client.Transport)
	}
}

// TestProviderSolverProfileDirIsUnderTheUserCache pins where the WebView2
// solver keeps its profile: the user's cache directory, beside the cover
// cache, so a clearance survives restarts without touching the database.
func TestProviderSolverProfileDirIsUnderTheUserCache(t *testing.T) {
	t.Parallel()
	dir, err := providerSolverProfileDir()
	if err != nil {
		t.Fatalf("providerSolverProfileDir: %v", err)
	}
	want := filepath.Join("autoreas-bridge", "cf-webview2")
	if !filepath.IsAbs(dir) || !strings.HasSuffix(dir, want) {
		t.Fatalf("profile dir = %q, want an absolute path ending in %q", dir, want)
	}
}

// TestProviderEventPublisherForwardsToTheBusBoundLater pins that clearance
// events reach whichever bus the app owns at publish time, and that a bus
// that is not wired yet drops the event instead of panicking.
func TestProviderEventPublisherForwardsToTheBusBoundLater(t *testing.T) {
	t.Parallel()
	a := &App{}
	publisher := appEventPublisher{app: a}
	event := cfclearance.ChallengeDetectedEvent{Domain: "jkanime.net", Attempt: 1}
	publisher.Publish(event)
	bus := &recordingBus{}
	a.eventBus = bus
	publisher.Publish(event)
	if len(bus.published) != 1 || bus.published[0].Name() != cfclearance.EventNameChallengeDetected {
		t.Fatalf("published %+v after binding the bus, want one %s", bus.published, cfclearance.EventNameChallengeDetected)
	}
}
