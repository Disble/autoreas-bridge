package notification

import (
	"context"
	"errors"
)

// Adapter is a presentation sink the Dispatcher fans a Notification out to
// (e.g. a UI-toast adapter emitting a Wails event, or a Windows desktop-toast
// adapter). Adapter failures are isolated by the Dispatcher -- see Notify.
type Adapter interface {
	Deliver(ctx context.Context, n Notification) error
}

// Dispatcher is the canonical Notifier implementation: it fans Notify out to
// every registered Adapter with failure isolation. One adapter returning an
// error never blocks another adapter, and the aggregate error returned by
// Notify exists purely for observability (logging) -- callers are expected
// to treat a Notify failure as non-fatal to their own feature logic.
type Dispatcher struct {
	adapters []Adapter
}

// NewDispatcher builds a Dispatcher over the given adapters. Zero adapters is
// valid and makes Notify a successful no-op.
func NewDispatcher(adapters ...Adapter) *Dispatcher {
	return &Dispatcher{adapters: adapters}
}

// Notify attempts delivery on every registered adapter, regardless of
// earlier failures, and never panics. It returns an aggregate error (via
// errors.Join) when one or more adapters failed, or nil when all succeeded
// or there were no adapters to attempt.
func (d *Dispatcher) Notify(ctx context.Context, n Notification) error {
	if d == nil || len(d.adapters) == 0 {
		return nil
	}

	var errs []error
	for _, adapter := range d.adapters {
		if adapter == nil {
			continue
		}
		if err := adapter.Deliver(ctx, n); err != nil {
			errs = append(errs, err)
		}
	}

	if len(errs) == 0 {
		return nil
	}
	return errors.Join(errs...)
}

var _ Notifier = (*Dispatcher)(nil)
