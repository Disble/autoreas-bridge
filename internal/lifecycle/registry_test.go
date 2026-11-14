package lifecycle_test

import (
	"errors"
	"slices"
	"sync"
	"testing"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/lifecycle"
)

// newRecorded builds a registry over a real bus and returns the statuses the bus carried.
func newRecorded(t *testing.T) (*lifecycle.Registry, *lifecycle.Writer, *[]lifecycle.Status) {
	t.Helper()
	bus := events.NewBus()
	var mu sync.Mutex
	published := []lifecycle.Status{}
	bus.Subscribe(lifecycle.EventNameReadinessChanged, func(event events.Event) {
		changed, ok := event.(lifecycle.ReadinessChangedEvent)
		if !ok {
			t.Errorf("event %T, want lifecycle.ReadinessChangedEvent", event)
			return
		}
		mu.Lock()
		published = append(published, changed.Status)
		mu.Unlock()
	})
	registry, writer := lifecycle.New(bus)
	return registry, writer, &published
}

// starting builds the expected status of a registered module.
func starting(id lifecycle.ModuleID) lifecycle.Status {
	return lifecycle.Status{Module: id, State: lifecycle.StateStarting}
}

// ready builds the expected status of a wired module.
func ready(id lifecycle.ModuleID) lifecycle.Status {
	return lifecycle.Status{Module: id, State: lifecycle.StateReady}
}

// failed builds the expected status of a module that will not be wired.
func failed(id lifecycle.ModuleID, reason string) lifecycle.Status {
	return lifecycle.Status{Module: id, State: lifecycle.StateFailed, Reason: reason}
}

func TestRegisterStartsModulesInOrderAndPublishesEachOnce(t *testing.T) {
	t.Parallel()
	registry, writer, published := newRecorded(t)

	writer.Register("episodes", "season")
	writer.Register("season", "downloads")

	want := []lifecycle.Status{starting("episodes"), starting("season"), starting("downloads")}
	if got := registry.Snapshot(); !slices.Equal(got, want) {
		t.Fatalf("Snapshot() = %v, want %v", got, want)
	}
	if !slices.Equal(*published, want) {
		t.Fatalf("published = %v, want %v", *published, want)
	}
	if got, ok := registry.Status("season"); !ok || got != starting("season") {
		t.Fatalf("Status(season) = %v, %v; want starting, true", got, ok)
	}
	if _, ok := registry.Status("missing"); ok {
		t.Fatal("Status(missing) ok = true, want false")
	}
}

func TestTransitionsLeaveStartingOnceAndPublish(t *testing.T) {
	t.Parallel()
	registry, writer, published := newRecorded(t)
	writer.Register("episodes", "season")

	if err := writer.MarkReady("episodes"); err != nil {
		t.Fatalf("MarkReady(episodes) = %v", err)
	}
	if err := writer.MarkFailed("season", "season store failed"); err != nil {
		t.Fatalf("MarkFailed(season) = %v", err)
	}

	want := []lifecycle.Status{ready("episodes"), failed("season", "season store failed")}
	if got := registry.Snapshot(); !slices.Equal(got, want) {
		t.Fatalf("Snapshot() = %v, want %v", got, want)
	}
	if got := (*published)[2:]; !slices.Equal(got, want) {
		t.Fatalf("published transitions = %v, want %v", got, want)
	}
}

func TestRejectedTransitionsChangeNothing(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		move func(*lifecycle.Writer) error
		want error
	}{
		{"ready again", func(w *lifecycle.Writer) error { return w.MarkReady("episodes") }, lifecycle.ErrInvalidTransition},
		{"fail after ready", func(w *lifecycle.Writer) error { return w.MarkFailed("episodes", "late") }, lifecycle.ErrInvalidTransition},
		{"ready after failure", func(w *lifecycle.Writer) error { return w.MarkReady("season") }, lifecycle.ErrInvalidTransition},
		{"unknown ready", func(w *lifecycle.Writer) error { return w.MarkReady("missing") }, lifecycle.ErrUnknownModule},
		{"unknown failure", func(w *lifecycle.Writer) error { return w.MarkFailed("missing", "x") }, lifecycle.ErrUnknownModule},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			registry, writer, published := newRecorded(t)
			writer.Register("episodes", "season")
			_ = writer.MarkReady("episodes")
			_ = writer.MarkFailed("season", "first")
			before, sent := registry.Snapshot(), len(*published)

			if err := tc.move(writer); !errors.Is(err, tc.want) {
				t.Fatalf("error = %v, want %v", err, tc.want)
			}
			if got := registry.Snapshot(); !slices.Equal(got, before) {
				t.Fatalf("Snapshot() = %v, want unchanged %v", got, before)
			}
			if len(*published) != sent {
				t.Fatalf("published %d events after a rejected move, want none", len(*published)-sent)
			}
		})
	}
}

func TestFailStartingFailsOnlyStartingModules(t *testing.T) {
	t.Parallel()
	registry, writer, published := newRecorded(t)
	writer.Register("tray", "episodes", "season")
	_ = writer.MarkReady("tray")

	got := writer.FailStarting("bridge database failed to open: locked")

	if want := []lifecycle.ModuleID{"episodes", "season"}; !slices.Equal(got, want) {
		t.Fatalf("FailStarting() = %v, want %v", got, want)
	}
	want := []lifecycle.Status{
		ready("tray"),
		failed("episodes", "bridge database failed to open: locked"),
		failed("season", "bridge database failed to open: locked"),
	}
	if snapshot := registry.Snapshot(); !slices.Equal(snapshot, want) {
		t.Fatalf("Snapshot() = %v, want %v", snapshot, want)
	}
	if tail := (*published)[len(*published)-2:]; !slices.Equal(tail, want[1:]) {
		t.Fatalf("published = %v, want %v", tail, want[1:])
	}
	if again := writer.FailStarting("second"); len(again) != 0 {
		t.Fatalf("second FailStarting() = %v, want none", again)
	}
}

func TestSubscriberReadsTheStateItWasToldAbout(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()
	registry, writer := lifecycle.New(bus)
	var seen lifecycle.Status
	bus.Subscribe(lifecycle.EventNameReadinessChanged, func(event events.Event) {
		changed := event.(lifecycle.ReadinessChangedEvent)
		seen, _ = registry.Status(changed.Module)
	})
	writer.Register("episodes")

	_ = writer.MarkReady("episodes")

	if seen != ready("episodes") {
		t.Fatalf("subscriber read %v, want ready", seen)
	}
}

func TestNilBusStoresWithoutPublishing(t *testing.T) {
	t.Parallel()
	registry, writer := lifecycle.New(nil)
	writer.Register("episodes")

	if err := writer.MarkReady("episodes"); err != nil {
		t.Fatalf("MarkReady() = %v", err)
	}
	if got, _ := registry.Status("episodes"); got != ready("episodes") {
		t.Fatalf("Status() = %v, want ready", got)
	}
}

func TestEventName(t *testing.T) {
	t.Parallel()
	if got := (lifecycle.ReadinessChangedEvent{}).Name(); got != "bridge.readiness" {
		t.Fatalf("Name() = %q, want bridge.readiness", got)
	}
}

func TestConcurrentReadsAndWrites(t *testing.T) {
	t.Parallel()
	registry, writer, _ := newRecorded(t)
	ids := []lifecycle.ModuleID{"a", "b", "c", "d"}
	writer.Register(ids...)
	var wg sync.WaitGroup
	for _, id := range ids {
		wg.Go(func() { _ = writer.MarkReady(id) })
		wg.Go(func() { _ = registry.Snapshot() })
	}
	wg.Wait()
	for _, status := range registry.Snapshot() {
		if status.State != lifecycle.StateReady {
			t.Fatalf("%s is %s, want ready", status.Module, status.State)
		}
	}
}
