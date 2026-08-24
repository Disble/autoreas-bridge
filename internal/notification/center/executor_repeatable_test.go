package center

import (
	"context"
	"testing"
)

// repeatableIntentHandler is the counterpart to spyIntentHandler: it reports
// itself repeatable, which is the case no production handler could reach
// before the Executor consulted Repeatable at all.
type repeatableIntentHandler struct {
	calls int
	err   error
}

func (h *repeatableIntentHandler) Execute(context.Context, map[string]string) error {
	h.calls++
	return h.err
}

func (*repeatableIntentHandler) Repeatable() bool { return true }

// TestExecuteRepeatableHandlerRunsAgainOnASecondPress pins that a handler
// declaring itself repeatable is re-invoked instead of refused.
//
// IntentHandler.Repeatable has existed on the port since the model was
// designed ("Repeatable reports whether a second press may re-invoke this
// handler"), and the Executor never called it: the already-executed guard ran
// unconditionally before the handler was even resolved, so the method governed
// nothing. It was a dead contract, and the cost was user-facing -- copying a
// hoster link is idempotent, and "Copy hoster 1" refused with already_executed
// the second time it was pressed.
func TestExecuteRepeatableHandlerRunsAgainOnASecondPress(t *testing.T) {
	t.Parallel()
	handler := &repeatableIntentHandler{}
	executor, _, recordID := newRepeatableTestExecutor(t, true, handler)
	ctx := context.Background()

	first := executor.Execute(ctx, recordID, "act-1")
	if !first.Executed {
		t.Fatalf("expected the first press to succeed, got %#v", first)
	}

	second := executor.Execute(ctx, recordID, "act-1")

	if !second.Executed {
		t.Fatalf("expected a repeatable action to run again on the second press, got %#v", second)
	}
	if second.Reason != "" {
		t.Fatalf("expected no refusal reason on a repeated press, got %q", second.Reason)
	}
	if handler.calls != 2 {
		t.Fatalf("expected the handler to be invoked twice, got %d", handler.calls)
	}
}

// TestExecuteRepeatableStillRefusesAForeignAction pins that repeatability
// widens exactly one gate and no other. Ownership is not a spend-once budget:
// an action that never belonged to this record must stay refused however many
// times it is pressed, or "repeatable" would quietly become "unchecked".
func TestExecuteRepeatableStillRefusesAForeignAction(t *testing.T) {
	t.Parallel()
	handler := &repeatableIntentHandler{}
	executor, _, recordID := newRepeatableTestExecutor(t, true, handler)
	ctx := context.Background()

	result := executor.Execute(ctx, recordID+1, "act-1")

	if result.Reason != RefusalForeignAction || result.Executed {
		t.Fatalf("expected foreign_action for a repeatable action pressed against the wrong record, got %#v", result)
	}
	if handler.calls != 0 {
		t.Fatalf("expected the handler never to run for a foreign action, got %d calls", handler.calls)
	}
}

// TestExecuteRepeatableStillRefusesWhenUnregistered pins the other gate
// repeatability must not widen: a token whose intent nobody registered is
// refused on every press, repeatable or not. Only the already-executed gate
// moves.
func TestExecuteRepeatableStillRefusesWhenUnregistered(t *testing.T) {
	t.Parallel()
	handler := &repeatableIntentHandler{}
	executor, registry, recordID := newRepeatableTestExecutor(t, true, handler)
	ctx := context.Background()

	registry.registered = false
	result := executor.Execute(ctx, recordID, "act-1")

	if result.Reason != RefusalIntentUnregistered || result.Executed {
		t.Fatalf("expected intent_unregistered for a repeatable action with no handler, got %#v", result)
	}
}

// newRepeatableTestExecutor mirrors newTestExecutor, which takes the concrete
// *spyIntentHandler and so cannot carry a repeatable one. Kept local rather
// than widening the shared helper to IntentHandler: that signature is used by
// every other executor test, and loosening it there to serve one case would
// cost more than the duplication here.
func newRepeatableTestExecutor(t *testing.T, registered bool, handler IntentHandler) (*Executor, *spyRegistry, int64) {
	t.Helper()
	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	recordID := seedExecutorAction(t, store, "act-1")
	registry := &spyRegistry{handler: handler, registered: registered}
	return NewExecutor(store, registry), registry, recordID
}
