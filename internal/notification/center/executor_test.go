package center

import (
	"context"
	"errors"
	"testing"
)

// spyIntentHandler counts Execute invocations and returns a configured
// error, letting each refusal-path test assert whether the handler was (or
// was not) actually invoked.
type spyIntentHandler struct {
	calls int
	err   error
}

func (h *spyIntentHandler) Execute(context.Context, map[string]string) error {
	h.calls++
	return h.err
}

func (*spyIntentHandler) Repeatable() bool { return false }

func (*spyIntentHandler) Activation() Activation { return ActivationBackground }

// spyRegistry counts Resolve calls so a test can prove Execute never even
// reached the registry lookup step (foreign_action, already_executed).
type spyRegistry struct {
	resolveCalls int
	handler      IntentHandler
	registered   bool
}

func (r *spyRegistry) Resolve(string) (IntentHandler, bool) {
	r.resolveCalls++
	return r.handler, r.registered
}

// seedExecutorAction inserts one record with one action and returns the
// record id, so each test can address a real, persisted action.
func seedExecutorAction(t *testing.T, store *Store, actionID string) int64 {
	t.Helper()
	id, err := store.InsertRecord(context.Background(), Record{
		CreatedAtMS: 1000, Title: "t", Body: "b", Level: "info", Source: "seed",
		Actions: []Action{{ID: actionID, Ordinal: 0, Label: "l", Intent: IntentDownloadRunAnime, Args: map[string]string{"animeId": "1"}}},
	})
	if err != nil {
		t.Fatalf("seed executor action: %v", err)
	}
	return id
}

// newTestExecutor is a small constructor shared by every test below, so
// each one only states the one thing it varies (registration, handler
// error, or a double press).
func newTestExecutor(t *testing.T, registered bool, handler *spyIntentHandler) (*Executor, *spyRegistry, int64) {
	t.Helper()
	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	recordID := seedExecutorAction(t, store, "act-1")
	registry := &spyRegistry{handler: handler, registered: registered}
	return NewExecutor(store, registry), registry, recordID
}

// TestExecuteIntentUnregisteredRefusedNoHandlerInvoked asserts an
// unregistered intent refuses intent_unregistered and never invokes a
// handler.
func TestExecuteIntentUnregisteredRefusedNoHandlerInvoked(t *testing.T) {
	t.Parallel()
	handler := &spyIntentHandler{}
	executor, _, recordID := newTestExecutor(t, false, handler)

	result := executor.Execute(context.Background(), recordID, "act-1")

	if result.Reason != RefusalIntentUnregistered || result.Executed {
		t.Fatalf("expected intent_unregistered, got %#v", result)
	}
	if handler.calls != 0 {
		t.Fatalf("expected no handler invocation for an unregistered intent, got %d", handler.calls)
	}
}

// TestExecuteTargetMissingWhenHandlerReturnsErrTargetMissing asserts a
// handler returning ErrTargetMissing refuses target_missing and persists
// the refusal via StampRefused.
func TestExecuteTargetMissingWhenHandlerReturnsErrTargetMissing(t *testing.T) {
	t.Parallel()
	handler := &spyIntentHandler{err: ErrTargetMissing}
	executor, _, recordID := newTestExecutor(t, true, handler)
	ctx := context.Background()

	result := executor.Execute(ctx, recordID, "act-1")

	if result.Reason != RefusalTargetMissing || result.Executed {
		t.Fatalf("expected target_missing, got %#v", result)
	}

	action, found, err := executor.store.LoadAction(ctx, "act-1")
	if err != nil || !found {
		t.Fatalf("reload action: found=%v err=%v", found, err)
	}
	if action.RefusedReason != RefusalTargetMissing {
		t.Fatalf("expected StampRefused to persist target_missing, got %q", action.RefusedReason)
	}
}

// TestExecuteUnrecognisedHandlerErrorMapsToTargetMissing asserts Decision
// C's defense in depth: a handler returning an arbitrary
// non-ErrTargetMissing error still yields exactly one of the four closed
// reasons (target_missing), never a fifth.
func TestExecuteUnrecognisedHandlerErrorMapsToTargetMissing(t *testing.T) {
	t.Parallel()
	handler := &spyIntentHandler{err: errors.New("boom: unrelated failure")}
	executor, _, recordID := newTestExecutor(t, true, handler)

	result := executor.Execute(context.Background(), recordID, "act-1")

	if result.Reason != RefusalTargetMissing || result.Executed {
		t.Fatalf("expected an unrecognised handler error to map to target_missing, got %#v", result)
	}
}

// TestExecuteEmptyRegistryNeverPanics is the Slice 5 kill switch, verified
// directly: an Executor built over a zero-registration StaticRegistry
// refuses every press with intent_unregistered, never panicking.
func TestExecuteEmptyRegistryNeverPanics(t *testing.T) {
	t.Parallel()
	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	recordID := seedExecutorAction(t, store, "act-1")
	executor := NewExecutor(store, NewStaticRegistry())

	result := executor.Execute(context.Background(), recordID, "act-1")

	if result.Reason != RefusalIntentUnregistered || result.Executed {
		t.Fatalf("expected an empty registry to refuse intent_unregistered, got %#v", result)
	}
}

// TestRefusalReasonIsAlwaysOneOfExactlyFour tables every failure path above
// and asserts the returned Reason is always a member of the closed 4-value
// set (notification-actions spec, "A refusal is always one of exactly four
// reasons").
func TestRefusalReasonIsAlwaysOneOfExactlyFour(t *testing.T) {
	t.Parallel()
	closedSet := map[RefusalReason]bool{
		RefusalIntentUnregistered: true,
		RefusalTargetMissing:      true,
		RefusalAlreadyExecuted:    true,
		RefusalForeignAction:      true,
	}

	cases := map[string]ExecuteResult{
		"foreign": func() ExecuteResult {
			executor, _, recordID := newTestExecutor(t, true, &spyIntentHandler{})
			return executor.Execute(context.Background(), recordID+1, "act-1")
		}(),
		"unregistered": func() ExecuteResult {
			executor, _, recordID := newTestExecutor(t, false, &spyIntentHandler{})
			return executor.Execute(context.Background(), recordID, "act-1")
		}(),
		"target_missing": func() ExecuteResult {
			executor, _, recordID := newTestExecutor(t, true, &spyIntentHandler{err: ErrTargetMissing})
			return executor.Execute(context.Background(), recordID, "act-1")
		}(),
		"already_executed": func() ExecuteResult {
			executor, _, recordID := newTestExecutor(t, true, &spyIntentHandler{})
			ctx := context.Background()
			executor.Execute(ctx, recordID, "act-1")
			return executor.Execute(ctx, recordID, "act-1")
		}(),
	}

	for name, result := range cases {
		if result.Executed {
			t.Fatalf("case %q: expected a refusal, got a success %#v", name, result)
		}
		if !closedSet[result.Reason] {
			t.Fatalf("case %q: expected one of the four closed refusal reasons, got %q", name, result.Reason)
		}
	}
}

// TestExecuteAlreadyExecutedOutranksIntentUnregistered drives one executor through an action's presses:
// a press on a foreign record is refused before any registry lookup, the first
// press runs the handler once and stamps executedAtMs, a second press is
// already_executed without re-invoking the handler, and already_executed still
// wins once the intent is no longer registered: the press reports what
// happened to the record, not the state of the registry.
func TestExecuteAlreadyExecutedOutranksIntentUnregistered(t *testing.T) {
	t.Parallel()
	handler := &spyIntentHandler{}
	executor, registry, recordID := newTestExecutor(t, true, handler)
	ctx := context.Background()

	foreign := executor.Execute(ctx, recordID+1, "act-1")
	if foreign.Reason != RefusalForeignAction || foreign.Executed {
		t.Fatalf("expected foreign_action, got %#v", foreign)
	}
	if registry.resolveCalls != 0 {
		t.Fatalf("expected no registry lookup for a foreign action, got %d", registry.resolveCalls)
	}
	if handler.calls != 0 {
		t.Fatalf("expected no handler invocation for a foreign action, got %d", handler.calls)
	}

	first := executor.Execute(ctx, recordID, "act-1")
	if !first.Executed || first.Reason != RefusalNone {
		t.Fatalf("expected the first press to succeed with no refusal reason, got %#v", first)
	}
	if first.ExecutedAtMS == 0 {
		t.Fatal("expected ExecutedAtMS to be stamped on a successful press")
	}
	if handler.calls != 1 {
		t.Fatalf("expected exactly 1 handler invocation after the first press, got %d", handler.calls)
	}

	second := executor.Execute(ctx, recordID, "act-1")
	if second.Reason != RefusalAlreadyExecuted || second.Executed {
		t.Fatalf("expected already_executed on the second press, got %#v", second)
	}
	if handler.calls != 1 {
		t.Fatalf("expected the handler NOT to be invoked again, got %d calls", handler.calls)
	}

	registry.registered = false
	third := executor.Execute(ctx, recordID, "act-1")
	if third.Reason != "already_executed" {
		t.Fatalf("expected the press to report what happened to the record, not the state of the registry; got %q", third.Reason)
	}
	if handler.calls != 1 {
		t.Fatalf("expected the handler NOT to be invoked again, got %d calls", handler.calls)
	}
}
