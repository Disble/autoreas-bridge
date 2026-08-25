package notification

import "context"

// Delivery is what a presentation adapter receives: the notification a producer wrote, plus the
// identity whoever persisted it just minted.
//
// The two are separate types on purpose. A producer says WHAT HAPPENED and cannot know an id;
// asking it for one would put a field on Notification that lies at every call site but one. An
// adapter, on the other hand, has to address a specific persisted token to render a button that
// does anything -- and before this type existed it could not, which is why the Windows toast had
// no button to give and the HeroUI toast's "View details" never rendered
// (docs/adr/016-notification-adapters-project-not-truncate.md).
type Delivery struct {
	Notification Notification
	// RecordID is the persisted record's id, or 0 when nothing persisted it.
	RecordID int64
	// ActionIDs are the persisted ids of Notification.Actions, INDEX FOR INDEX. Nil when nothing
	// persisted them, which is the ordinary case for a bare Dispatcher and on a machine whose
	// bridge database will not open.
	//
	// Read it through ActionID rather than by indexing: the parallel-slice invariant is the one
	// thing that could silently bind a button to the wrong verb, so exactly one place is allowed
	// to reason about length.
	ActionIDs []string
}

// ActionID returns the persisted id of the action at index, or "" when there is none.
//
// An empty answer is the honest one in three different situations -- nothing persisted this
// delivery, the index addresses no action, or the persisted set is shorter than the specs -- and
// every one of them means the same thing to a caller: this action is not addressable, so render
// it without a press. Returning a neighbour's id in any of them would bind a button to a verb the
// user did not choose.
func (d Delivery) ActionID(index int) string {
	if index < 0 || index >= len(d.ActionIDs) {
		return ""
	}
	return d.ActionIDs[index]
}

// Deliverer is the wider door a Notifier may also offer.
//
// It exists so a wrapper that knows a delivery's identity can hand it over without widening the
// producer-facing port. center.Service holds its inner sink as a plain Notifier and type-asserts
// to this interface: when the value behind it can take an envelope it gets one, and when it
// cannot -- a hand-written test double, a future sink that only wants notifications -- the
// wrapper falls back to Notify and nothing breaks.
//
// This is the same opportunistic-widening shape the standard library uses for io.WriterTo: the
// narrow interface stays the contract, and the wide one is an optimisation the caller discovers.
type Deliverer interface {
	Deliver(ctx context.Context, d Delivery) error
}
