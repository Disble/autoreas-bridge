package notification

import "context"

// uiToastEventName is the Wails runtime event name the frontend subscribes
// to (notification-source.ts). This is the contract the frontend depends on
// -- it MUST stay "notification.push" exactly (notifications spec, "UI-Toast
// Adapter Emits the notification.push Event").
const uiToastEventName = "notification.push"

// emitFunc mirrors the injectable emit-fn shape used by
// defaultObservabilityEmit (app.go), so the UIToastAdapter is testable with a
// fake emit and degrades gracefully when the Wails runtime/emit is absent.
type emitFunc func(ctx context.Context, eventName string, optionalData ...any)

// UIToastAdapter delivers a Notification to the frontend by emitting a Wails
// runtime event named "notification.push" carrying the full Notification
// payload, mirroring the existing observability.log emit mechanism
// (app.go:73-78, defaultObservabilityEmit).
type UIToastAdapter struct {
	emit emitFunc
}

// NewUIToastAdapter builds a UIToastAdapter around the given emit function.
// A nil emit is accepted and degrades Deliver to a no-op -- this is the seam
// used when the Wails runtime is unavailable (e.g. a unit test or
// non-runtime context).
func NewUIToastAdapter(emit emitFunc) *UIToastAdapter {
	return &UIToastAdapter{emit: emit}
}

// Deliver emits the notification.push event carrying the whole delivery -- the
// notification AND the identity behind it, so the toast can address a persisted
// token rather than only name it. It never returns an error from the emit itself
// (the underlying wruntime.EventsEmit call has no error return); a nil emit
// function is a safe no-op.
func (a *UIToastAdapter) Deliver(ctx context.Context, delivery Delivery) error {
	if a == nil || a.emit == nil {
		return nil
	}
	a.emit(ctx, uiToastEventName, toUIToastPayload(delivery))
	return nil
}

// uiToastAction is one action as the frontend receives it: the producer's spec plus the id that
// addresses its persisted token, and the RowRef that says which of the two CTA levels it belongs
// to (docs/notification-cta-policy.md).
//
// RowRef is on the wire deliberately. The frontend's ActionSpec mirror omitted it, so the toast
// could not tell a footer verb from a row verb even once it started receiving them.
type uiToastAction struct {
	ID     string            `json:"ID"`
	Label  string            `json:"Label"`
	Intent string            `json:"Intent"`
	Args   map[string]string `json:"Args"`
	RowRef string            `json:"RowRef"`
}

// uiToastPayload is the notification.push payload: the notification's own fields at the TOP
// level, plus the identity beside them.
//
// Flat rather than nested, and that is a compatibility constraint rather than a preference. The
// frontend contract has read Title/Body/Level at the top level since this event existed, and has
// declared RecordID optional since Slice 4-i waiting for a producer to send one -- so nesting the
// notification under a wrapper would blank every toast in the app at once.
//
// Actions is declared here as well as on the embedded Notification: the shallower field wins in
// encoding/json, which is what lets the wire carry ids the domain type has no business holding.
type uiToastPayload struct {
	Notification
	Actions  []uiToastAction `json:"Actions"`
	RecordID int64           `json:"RecordID,omitempty"`
}

// toUIToastPayload pairs each action with the id minted for it, index for index, through the one
// accessor allowed to reason about that invariant.
func toUIToastPayload(delivery Delivery) uiToastPayload {
	actions := make([]uiToastAction, 0, len(delivery.Notification.Actions))
	for index, spec := range delivery.Notification.Actions {
		actions = append(actions, uiToastAction{
			ID:     delivery.ActionID(index),
			Label:  spec.Label,
			Intent: spec.Intent,
			Args:   spec.Args,
			RowRef: spec.RowRef,
		})
	}
	return uiToastPayload{Notification: delivery.Notification, Actions: actions, RecordID: delivery.RecordID}
}
