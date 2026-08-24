package center

import (
	"context"
	"sort"
	"testing"
)

// noopHandler is a minimal, always-succeeding IntentHandler used only to
// populate registry Keys()/Resolve() checks -- its Execute body is never
// exercised by these tests.
type noopHandler struct{}

func (noopHandler) Execute(context.Context, map[string]string) error { return nil }

func (noopHandler) Repeatable() bool { return false }

// TestEmptyRegistryResolveReturnsNotFoundWithoutPanic asserts a fresh,
// zero-registration StaticRegistry resolves any key to (nil, false) rather
// than panicking -- the Slice 5 kill switch (notification-actions spec, "An
// empty registry refuses every action, without crashing").
func TestEmptyRegistryResolveReturnsNotFoundWithoutPanic(t *testing.T) {
	t.Parallel()
	registry := NewStaticRegistry()

	handler, found := registry.Resolve("anything.at.all")

	if found || handler != nil {
		t.Fatalf("expected an empty registry to resolve to (nil, false), got (%v, %v)", handler, found)
	}
}

// TestDownloadRetryRunAbsentFromRegistryKeys is MANDATORY: builds a
// StaticRegistry with the three real intents registered exactly as the
// composition root would, then asserts "download.retry_run" is NOT among
// Keys() -- asserted against LIVE registry state, never a source grep
// (notification-actions spec, "download.retry_run is absent from the
// registry").
func TestDownloadRetryRunAbsentFromRegistryKeys(t *testing.T) {
	t.Parallel()
	registry := NewStaticRegistry()
	registry.Register(IntentDownloadRunAnime, noopHandler{})
	registry.Register(IntentScheduleRunMissedNow, noopHandler{})
	registry.Register(IntentScheduleIgnoreMissed, noopHandler{})

	for _, key := range registry.Keys() {
		if key == "download.retry_run" {
			t.Fatal(`expected "download.retry_run" to never be registered -- the download service exposes only RunOnce/RunAnime`)
		}
	}
}

// TestDownloadCompletionActionResolvesToRunAnime pins the shared
// IntentDownloadRunAnime constant's literal value and guards against a
// future retry-shaped rename (notification-actions spec, "A download
// completion action resolves to download.run_anime").
func TestDownloadCompletionActionResolvesToRunAnime(t *testing.T) {
	t.Parallel()
	action := Action{Intent: IntentDownloadRunAnime, Label: "Run this anime again"}

	if action.Intent != "download.run_anime" {
		t.Fatalf(`expected the completion action's intent to be exactly "download.run_anime", got %q`, action.Intent)
	}
}

// TestStaticRegistryKeysAreSorted asserts Keys() returns a deterministic,
// sorted order regardless of registration order.
func TestStaticRegistryKeysAreSorted(t *testing.T) {
	t.Parallel()
	registry := NewStaticRegistry()
	registry.Register("z.last", noopHandler{})
	registry.Register("a.first", noopHandler{})

	got := registry.Keys()
	if !sort.StringsAreSorted(got) {
		t.Fatalf("expected sorted keys, got %v", got)
	}
	if len(got) != 2 || got[0] != "a.first" || got[1] != "z.last" {
		t.Fatalf(`expected ["a.first" "z.last"], got %v`, got)
	}
}

// TestSingleFireFuncIsNeverRepeatable asserts SingleFireFunc-adapted
// handlers always report Repeatable() == false, the single-fire default.
func TestSingleFireFuncIsNeverRepeatable(t *testing.T) {
	t.Parallel()
	handler := SingleFireFunc(func(context.Context, map[string]string) error { return nil })

	if handler.Repeatable() {
		t.Fatal("expected SingleFireFunc to produce a non-repeatable handler")
	}
}

// TestStaticRegistryResolveFindsRegisteredHandler asserts Resolve returns
// the exact handler instance registered under a key.
func TestStaticRegistryResolveFindsRegisteredHandler(t *testing.T) {
	t.Parallel()
	registry := NewStaticRegistry()
	handler := noopHandler{}
	registry.Register("some.intent", handler)

	got, found := registry.Resolve("some.intent")
	if !found || got != handler {
		t.Fatalf("expected Resolve to find the registered handler, got (%v, %v)", got, found)
	}
}
