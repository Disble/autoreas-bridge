package announce

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
)

// gatedPending blocks every pending read until released, and counts the passes that read.
type gatedPending struct {
	reads   atomic.Int32
	entered chan struct{}
	release chan struct{}
}

// newGatedPending returns a pending source that blocks until released.
func newGatedPending() *gatedPending {
	return &gatedPending{entered: make(chan struct{}, 16), release: make(chan struct{})}
}

func (g *gatedPending) PendingAnnounce(ctx context.Context) ([]episodes.Pending, error) {
	g.reads.Add(1)
	g.entered <- struct{}{}
	select {
	case <-g.release:
	case <-ctx.Done():
	}
	return nil, nil
}

func (g *gatedPending) ClearPending(context.Context, episodes.Pending) error { return nil }

// waitEntered waits for a pass to start reading.
func waitEntered(t *testing.T, g *gatedPending) {
	t.Helper()

	select {
	case <-g.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("the pass never started")
	}
}

func TestTriggerAnnouncesInTheBackground(t *testing.T) {
	t.Parallel()

	store := storeWithMarks(t, "a")
	bus := newBusSpy()
	announcer := New(Deps{Pending: store, Snapshots: snapshotsStub{payloads: map[string]string{"a": `{}`}}, Bus: bus})
	t.Cleanup(announcer.Stop)

	announcer.Trigger()
	announcer.Wait()

	if len(bus.all()) != 1 {
		t.Fatalf("a trigger must run one pass, got %v", bus.all())
	}
}

func TestTriggerBurstDuringAPassQueuesExactlyOneRepeat(t *testing.T) {
	t.Parallel()

	pending := newGatedPending()
	announcer := New(Deps{Pending: pending, Snapshots: snapshotsStub{}, Bus: newBusSpy()})
	t.Cleanup(announcer.Stop)

	announcer.Trigger()
	waitEntered(t, pending)
	for i := 0; i < 50; i++ {
		announcer.Trigger()
	}
	close(pending.release)
	announcer.Wait()

	if got := pending.reads.Load(); got != 2 {
		t.Fatalf("a burst during a pass must cost exactly one repeat: want 2 passes, got %d", got)
	}
}

func TestStopCancelsThePassAndRefusesLaterTriggers(t *testing.T) {
	t.Parallel()

	pending := newGatedPending()
	announcer := New(Deps{Pending: pending, Snapshots: snapshotsStub{}, Bus: newBusSpy()})

	announcer.Trigger()
	waitEntered(t, pending)
	announcer.Trigger()

	stopped := make(chan struct{})
	go func() {
		announcer.Stop()
		close(stopped)
	}()
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("Stop must cancel the running pass and return")
	}

	announcer.Trigger()
	announcer.Wait()
	if got := pending.reads.Load(); got != 1 {
		t.Fatalf("Stop must drop the queued repeat and refuse later triggers: want 1 pass, got %d", got)
	}
}

// panickingPending panics on every read.
type panickingPending struct{}

func (panickingPending) PendingAnnounce(context.Context) ([]episodes.Pending, error) {
	panic("boom")
}

func (panickingPending) ClearPending(context.Context, episodes.Pending) error { return nil }

func TestAPanickingPassIsRecoveredAndLoggedAsAnError(t *testing.T) {
	t.Parallel()

	log := &logRecorder{}
	announcer := New(Deps{Pending: panickingPending{}, Snapshots: snapshotsStub{}, Bus: newBusSpy(), Logger: log})
	t.Cleanup(announcer.Stop)

	announcer.Trigger()
	announcer.Wait()

	if levels := log.levels(); len(levels) != 1 || levels[0] != logger.LevelError {
		t.Fatalf("want one error entry, got %v", log.entries)
	}
	announcer.Trigger()
	announcer.Wait()
	if levels := log.levels(); len(levels) != 2 {
		t.Fatalf("the announcer must keep working after a panic, got %v", log.entries)
	}
}

func TestWaitWithoutAPassReturnsAtOnce(t *testing.T) {
	t.Parallel()

	announcer := New(Deps{Pending: newGatedPending(), Snapshots: snapshotsStub{}, Bus: newBusSpy()})
	done := make(chan struct{})
	go func() {
		announcer.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Wait with no pass must return at once")
	}
}

// TestAMarkSurvivesAShutdownBetweenPublishAndClear is the shutdown-window regression: the changelog
// recorder writes under the same lifetime as the announcer, and shutdown ends it after the event was
// published but before the mark was cleared. The clear must fail with it, so the mark survives and
// the next start announces the anime again instead of losing it for good.
func TestAMarkSurvivesAShutdownBetweenPublishAndClear(t *testing.T) {
	t.Parallel()

	store := storeWithMarks(t, "a")
	lifetime, shutdown := context.WithCancel(context.Background())
	defer shutdown()
	bus := newBusSpy()
	// The recorder's insert would fail here, on the ended lifetime; the subscriber ends it.
	bus.Subscribe(events.EventNameEpisodeDurationsChanged, func(events.Event) { shutdown() })
	log := &logRecorder{}
	announcer := New(Deps{Pending: store, Bus: bus, Logger: log, Parent: lifetime,
		Snapshots: snapshotsStub{payloads: map[string]string{"a": `{}`}}})

	announcer.Trigger()
	announcer.Wait()

	if len(bus.all()) != 1 {
		t.Fatalf("the anime must have been published once, got %v", bus.all())
	}
	if ids := pendingIDs(t, store); len(ids) != 1 || ids[0] != "a" {
		t.Fatalf("a clear after shutdown must fail and keep the mark, got %v", ids)
	}
	if levels := log.levels(); len(levels) != 1 || levels[0] != logger.LevelWarn {
		t.Errorf("want the failed clear logged once as a warning, got %v", log.entries)
	}
}
