package center

import (
	"context"
	"time"
)

// ExecuteResult is the typed outcome of a pressed action (design §5.7).
type ExecuteResult struct {
	Executed     bool
	Reason       RefusalReason
	Message      string
	ExecutedAtMS int64
}

// refusalMessages gives every closed refusal reason a stable, user-facing
// Message here, not left to the frontend, so a non-frontend carrier (a
// future tray/deep-link press) gets the same wording.
var refusalMessages = map[RefusalReason]string{
	RefusalForeignAction:      "This action does not belong to this notification.",
	RefusalAlreadyExecuted:    "This action already ran.",
	RefusalIntentUnregistered: "This action is not available yet.",
	RefusalTargetMissing:      "The thing this action pointed at is gone.",
}

// Executor resolves and runs pressed action tokens. It is constructed at the
// composition root AFTER the subsystems whose intents it registers exist
// (a.downloadService is only assigned once startDownloadOrchestration runs,
// long after a.notifier is built at app_startup_runtime.go:139) -- which is
// why this is a separate type from Service rather than a field on it.
type Executor struct {
	store    *Store
	registry IntentRegistry
	now      func() time.Time
}

// NewExecutor builds an Executor over store and registry, defaulting the
// clock to time.Now.
func NewExecutor(store *Store, registry IntentRegistry) *Executor {
	return &Executor{store: store, registry: registry, now: time.Now}
}

// refuse persists reason on actionID via StampRefused (so the button stays
// permanently disabled across a restart, design Decision D) and builds the
// returned refusal outcome. The stamp's own error is deliberately not
// propagated: a refusal MUST still be reported to the caller even when
// persisting it happens to fail, mirroring Service.Notify's non-blocking
// contract for persist failures (R-1).
func (e *Executor) refuse(ctx context.Context, actionID string, reason RefusalReason) ExecuteResult {
	_ = e.store.StampRefused(ctx, actionID, reason)
	return ExecuteResult{Reason: reason, Message: refusalMessages[reason]}
}

// Execute validates and runs one pressed action, in the fixed order the
// notification-actions spec requires:
//
//	(a) does actionID belong to THIS notificationID?     -> foreign_action
//	(b) has it already executed (and is not repeatable)? -> already_executed
//	(c) is intent registered in the IntentRegistry?      -> intent_unregistered
//	(d) does the bound handler accept the frozen args?   -> target_missing
//
// An unregistered key is refused outright: never resolved by name lookup,
// shell execution, or URL. Every refusal is persisted via StampRefused so
// the button stays permanently disabled across a restart.
func (e *Executor) Execute(ctx context.Context, notificationID int64, actionID string) ExecuteResult {
	action, found, err := e.store.LoadAction(ctx, actionID)
	if err != nil || !found || action.NotificationID != notificationID {
		return e.refuse(ctx, actionID, RefusalForeignAction)
	}

	// Resolution moves above the already-executed gate because only the handler
	// knows whether a second press is meaningful. `IntentHandler.Repeatable` had
	// been on the port since the model was designed and was never consulted, so
	// that gate fired unconditionally and the method governed nothing -- a dead
	// contract whose cost was user-facing: copying a hoster link is idempotent, and
	// "Copy hoster 1" refused with already_executed the second time it was pressed.
	handler, registered := e.registry.Resolve(action.Intent)

	// Resolving earlier deliberately does NOT reorder the refusals. An action that
	// already ran still refuses already_executed even when its intent has since
	// disappeared, which is what TestExecuteAlreadyExecutedOutranksIntentUnregistered
	// pins and why: the press did happen, and reporting the state of the registry
	// instead would be a true statement about the process and a false one about
	// their notification. Only a REGISTERED handler that declares itself repeatable
	// widens this gate; an unregistered one cannot, since nothing is there to ask.
	if action.ExecutedAtMS != 0 && (!registered || !handler.Repeatable()) {
		return e.refuse(ctx, actionID, RefusalAlreadyExecuted)
	}

	if !registered {
		return e.refuse(ctx, actionID, RefusalIntentUnregistered)
	}

	// Decision C defense in depth: an IntentHandler MUST return only nil or
	// ErrTargetMissing, but a misbehaving handler returning any other error
	// is still mapped into the closed set here, never leaked as a fifth
	// reason.
	if err := handler.Execute(ctx, action.Args); err != nil {
		return e.refuse(ctx, actionID, RefusalTargetMissing)
	}

	executedAtMS := e.now().UnixMilli()
	if err := e.store.StampExecuted(ctx, actionID, executedAtMS); err != nil {
		return ExecuteResult{Reason: RefusalTargetMissing, Message: "failed to persist execution"}
	}
	return ExecuteResult{Executed: true, ExecutedAtMS: executedAtMS}
}
