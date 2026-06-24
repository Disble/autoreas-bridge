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
type emitFunc func(ctx context.Context, eventName string, optionalData ...interface{})

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

// Deliver emits the notification.push event carrying n. It never returns an
// error from the emit itself (the underlying wruntime.EventsEmit call has no
// error return); a nil emit function is a safe no-op.
func (a *UIToastAdapter) Deliver(ctx context.Context, n Notification) error {
	if a == nil || a.emit == nil {
		return nil
	}
	a.emit(ctx, uiToastEventName, n)
	return nil
}
