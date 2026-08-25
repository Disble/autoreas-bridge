package notification

import (
	"context"
	"errors"
)

// Adapter is a presentation sink the Dispatcher fans a Delivery out to (e.g. a
// UI-toast adapter emitting a Wails event, or a Windows desktop-toast adapter).
// Adapter failures are isolated by the Dispatcher -- see Notify.
//
// It takes a Delivery rather than a bare Notification so an adapter can address
// the persisted token behind an action instead of only naming it. That also
// makes Adapter and Notifier different types: they used to share a signature,
// so the compiler could not tell a presentation sink from a notifier and a
// producer wired to an adapter compiled fine.
type Adapter = Deliverer

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

// Notify is the narrow producer-facing door: it wraps n in an envelope carrying
// no identity and delivers that. A producer never knows a record id, so this is
// the only honest envelope it could build.
func (d *Dispatcher) Notify(ctx context.Context, n Notification) error {
	return d.Deliver(ctx, Delivery{Notification: n})
}

// Deliver attempts delivery on every registered adapter, regardless of earlier
// failures, and never panics. It returns an aggregate error (via errors.Join)
// when one or more adapters failed, or nil when all succeeded or there were no
// adapters to attempt.
//
// This is the door a wrapper that HAS the identity uses -- center.Service, once
// it has persisted the record and knows what the tokens are called.
func (d *Dispatcher) Deliver(ctx context.Context, delivery Delivery) error {
	if d == nil || len(d.adapters) == 0 {
		return nil
	}

	var errs []error
	for _, adapter := range d.adapters {
		if adapter == nil {
			continue
		}
		if err := adapter.Deliver(ctx, delivery); err != nil {
			errs = append(errs, err)
		}
	}

	if len(errs) == 0 {
		return nil
	}
	return errors.Join(errs...)
}

var (
	_ Notifier  = (*Dispatcher)(nil)
	_ Deliverer = (*Dispatcher)(nil)
)
